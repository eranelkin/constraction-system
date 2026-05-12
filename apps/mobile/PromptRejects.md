# Mobile Service — Issues by Priority

---

## CRITICAL

### 1. Self-Selected Role at Registration
- **File:** `src/app/(auth)/register.tsx:16,28`
- **Issue:** Users choose their own role (`member` or `manager`) via a UI toggle that is sent verbatim to `POST /auth/register`. No server-side enforcement prevents self-promotion.
- **Risk:** Any user can register as `manager`, gaining job creation, hiring, and user-management capabilities.
- **Fix:** Remove the role picker. Hardcode `role: 'member'` on the client. Backend must enforce that `/auth/register` only creates `member` accounts; role elevation must be a separate admin-only operation.

---

### 2. Hardcoded Test Credentials + Unconditional Destructive Function
- **File:** `src/app/(auth)/login.tsx:22–38`
- **Issue:** Three test credentials are hardcoded in source (`member1@test.com`, `member2@test.com`, `manager1@test.com`, password `Test1234!`). The `clearMessages()` function (line 28) calling `POST /dev/clear-messages` is defined unconditionally — only the JSX button is behind `__DEV__`, not the function itself.
- **Risk:** Credentials are in the git history and every build artifact. `clearMessages` is callable from any JS execution context in the bundle regardless of `__DEV__`.
- **Fix:** Delete `DEV_USERS` and `clearMessages` entirely. Dev shortcuts belong in a separate file excluded from production builds via a Babel plugin or `app.config.js` variant. Backend must reject `/dev/*` endpoints outside development unconditionally.

---

## HIGH

### 3. No Socket Disconnect on Logout
- **File:** `src/app/(home)/index.tsx:274–286`
- **Issue:** `handleLogout` calls `clearSession()` and navigates to login but never calls `disconnectSocket()`. The singleton socket in `src/lib/socket.ts:5` stays alive and authenticated.
- **Risk:** After logout the socket remains open, delivering real-time events (messages, permission changes) to the now-logged-out session. On a shared device the next user may inherit these events.
- **Fix:**
  ```typescript
  onPress: () => {
    void disconnectSocket();
    void clearSession().then(() =>
      router.replace("/(auth)/login" as never),
    );
  },
  ```

---

### 4. Socket Token Never Refreshed After Access Token Rotation
- **File:** `src/lib/socket.ts:7–16` + `src/lib/api-client.ts:31–68`
- **Issue:** The socket is created once with the token at connection time (`auth: { token }`). When the access token is silently refreshed by `attemptRefresh()`, the socket's auth token is never updated.
- **Risk:** After token rotation, socket reconnects authenticate with a revoked token, causing silent loss of all real-time events, or undermining the token rotation security model if the server accepts the old token.
- **Fix:** After `updateTokens()` succeeds, update the socket auth or reconnect with the new token:
  ```typescript
  const sock = getSocket();
  if (sock) sock.auth = { token: data.tokens.accessToken };
  ```

---

### 5. Plain HTTP Fallback + Missing Env Var Assertion
- **File:** `src/lib/api-client.ts:5`, `src/lib/socket.ts:3`, `src/app/(messages)/[id].tsx:25`, `src/app/(home)/index.tsx:59`, `eas.json:9`
- **Issue:** `EXPO_PUBLIC_API_URL` defaults to `http://localhost:4501` across four files. `eas.json` contains the placeholder `https://YOUR_API_URL_HERE`, meaning a misconfigured production build silently sends all traffic over plain HTTP to localhost.
- **Risk:** Credentials, tokens, voice recordings, and photos transmitted over plain HTTP. `EXPO_PUBLIC_*` vars are baked into the JS bundle and visible to anyone who unpacks the APK/IPA.
- **Fix:** Replace the `??` fallback with a build-time assertion and enforce HTTPS in non-dev builds:
  ```typescript
  const API_URL = (() => {
    const url = process.env['EXPO_PUBLIC_API_URL'];
    if (!url) throw new Error('EXPO_PUBLIC_API_URL is not set');
    if (!__DEV__ && !url.startsWith('https://'))
      throw new Error('API_URL must use HTTPS in production');
    return url;
  })();
  ```
  Consolidate `API_URL` to a single import from `api-client.ts` — it is currently duplicated in four files.

---

### 6. JWT Access Token Exposed in URL for Audio Playback
- **File:** `src/app/(messages)/[id].tsx:652`
- **Issue:** The full JWT access token is appended as a URL query parameter: `${audioUrl}?token=${encodeURIComponent(token)}`.
- **Risk:** Token is logged verbatim in server access logs, proxy logs, device crash logs, and any CDN in front of the media server. A leaked log entry grants full API access for up to 15 minutes.
- **Fix:** The backend should issue short-lived (30–60 second) signed media URLs. As an interim, a dedicated `POST /media/token` endpoint returning a short-lived opaque media token is preferable to exposing the full JWT in a URL.

---

### 7. Raw API Error Messages Surfaced to Users
- **File:** `src/app/(auth)/login.tsx:72–78`, `src/app/(auth)/register.tsx:32–34`, `src/app/(messages)/[id].tsx:386`, multiple Alert calls throughout
- **Issue:** `err instanceof Error ? err.message : "Unknown error"` passes the raw server error body to the user via `Alert.alert`. `ApiRequestError` copies the server's `body.error` string directly as the JS error message.
- **Risk:** Internal SQL errors, table names, stack traces, or field validation details from the server are shown verbatim on screen.
- **Fix:** Map known `ApiError.code` values to i18n strings. Only show raw messages in `__DEV__`. Never surface server internals to the UI.

---

## MEDIUM

### 8. Socket Listener Accumulation on Repeated Focus
- **File:** `src/app/(home)/index.tsx:240–271`, `src/app/(messages)/[id].tsx:250–273`
- **Issue:** Event listeners are registered in `useFocusEffect` / `useEffect` but cleanup uses `sock.off('event_name')` with no function reference, removing all listeners for that event name — including ones registered by other screens.
- **Risk:** Rapid tab switching stacks multiple `conversation_updated` listeners, causing `loadData` to fire N times per event (self-inflicted API flood). Simultaneously, navigating away tears down listeners owned by the other screen, dropping real-time events.
- **Fix:** Use named handler references:
  ```typescript
  const handler = () => void loadData(meRef.current?.id, true);
  sock.on('conversation_updated', handler);
  return () => { sock.off('conversation_updated', handler); };
  ```

---

### 9. No Pagination or Caching on Home Screen Data Loading
- **File:** `src/app/(home)/index.tsx` — calls to `/auth/users`, `/groups/mine`, `/messaging/conversations`
- **Issue:** Three endpoints are fetched in parallel on every screen focus with no pagination, no caching TTL, and no debounce. `/auth/users` returns all users on the site.
- **Risk:** On a 300-worker site, every tab switch triggers 300-record fetches. With 300 concurrent users doing this simultaneously, that is 90,000 user records per second from focus events alone.
- **Fix:** Implement cursor-based pagination. Cache responses with a short TTL (30 seconds) keyed by a `useRef` timestamp. Trigger a refresh only on `conversation_updated` socket events or after TTL expiry.

---

### 10. Voice Upload via Base64-in-JSON Instead of Multipart
- **File:** `src/app/(messages)/[id].tsx:470–478`
- **Issue:** Voice recordings are read entirely into memory as base64 (`FileSystem.readAsStringAsync`) and sent in a JSON body. There is no client-side size limit before the read-and-encode operation. Video uploads already use the correct multipart pattern via `uploadFile()`.
- **Risk:** A 60-second m4a is ~600KB raw / ~800KB as base64, held in the JS heap. On low-end Android devices, large recordings cause OOM crashes. 33% size overhead vs. multipart on every voice message.
- **Fix:** Use `FileSystem.uploadAsync` (multipart) for voice recordings, matching the existing `uploadFile()` pattern. Add a client-side file size check before uploading.

---

### 11. Unvalidated Server-Pushed Settings via Socket
- **File:** `src/app/(messages)/[id].tsx:264–267`
- **Issue:** `settings_updated` socket events update `videoQuality` and `videoMaxDurationSeconds` state without range validation.
- **Risk:** A compromised or spoofed server event could push `videoQuality: 99999` or a negative duration, causing undefined behaviour in the camera recorder.
- **Fix:**
  ```typescript
  sock.on('settings_updated', (payload) => {
    if (typeof payload.videoQuality === 'number' &&
        payload.videoQuality >= 0 && payload.videoQuality <= 1)
      setVideoQuality(payload.videoQuality);
    if (typeof payload.videoMaxDurationSeconds === 'number' &&
        payload.videoMaxDurationSeconds > 0 && payload.videoMaxDurationSeconds <= 300)
      setVideoMaxDuration(payload.videoMaxDurationSeconds);
  });
  ```

---

### 12. No Password Strength Validation
- **File:** `src/app/(auth)/register.tsx:19–23`
- **Issue:** The only password check is `if (!password)`. Any non-empty string is accepted.
- **Risk:** 300 field workers registering themselves will use weak passwords (`1234`, their name, etc.).
- **Fix:** Enforce minimum requirements client-side (8+ chars, one digit, one uppercase) with a visible strength indicator. Enforce the same rules server-side as the authoritative check.

---

### 13. `/dev/clear-messages` Called Without Auth Token
- **File:** `src/app/(auth)/login.tsx:28–31`
- **Issue:** `clearMessages()` calls `POST /dev/clear-messages` with no Authorization header — there is no `token` in the `apiRequest` call.
- **Risk:** If the backend endpoint is reachable in production, any unauthenticated actor can destroy all message data by calling it directly.
- **Fix:** Delete the function from the mobile client. On the backend, ensure all `/dev/*` routes are gated at the router registration level by `NODE_ENV === 'development'`.

---

## LOW

### 14. Avatar Images Loaded Without Authentication
- **File:** `src/app/(messages)/[id].tsx:43`, `src/app/(home)/index.tsx:93`
- **Issue:** `<Image source={{ uri: \`${API_URL}/users/${userId}/avatar\` }} />` makes a plain GET with no Authorization header.
- **Risk:** If the endpoint is public, any unauthenticated actor can enumerate user avatars by iterating UUIDs. If it requires auth, avatars silently fail to load for all users.
- **Fix:** Use signed URLs for avatars, or pass the token as a header via a custom image-fetching component.

---

### 15. `console.error` in Production Builds
- **File:** `src/app/(messages)/[id].tsx:446,485,667,678,714`, `src/app/(home)/index.tsx:179`, `src/lib/hooks/useFieldExtraction.ts:32`, others
- **Issue:** `console.error` is called unconditionally in production builds with internal operation names and error details.
- **Risk:** Internal API errors and operation names are visible via ADB logcat / iPhone Console on a connected device during a security incident or physical inspection.
- **Fix:** Strip `console.*` calls in production using `babel-plugin-transform-remove-console`, or guard all calls with `if (__DEV__)`.

---

### 16. No Certificate Pinning
- **File:** N/A — absent from entire `apps/mobile/`
- **Issue:** No SSL/TLS certificate pinning is implemented. The app trusts the device certificate store.
- **Risk:** On a construction site network with a corporate proxy, or on a device with a compromised CA installed, all HTTPS traffic (tokens, voice, photos, video) can be intercepted.
- **Fix:** Implement public key pinning for the production API domain using a custom Expo native module or plugin.

---

### 17. No Biometric / PIN Re-Auth on App Foreground
- **File:** N/A — absent from entire `apps/mobile/`
- **Issue:** After a device is unlocked, the app auto-logs in from stored tokens with no step-up authentication prompt.
- **Risk:** On a shared or stolen unlocked device, anyone can access all messages, voice recordings, field reports, and job details.
- **Fix:** Add a biometric prompt on app foreground using `expo-local-authentication`. Require re-auth for high-privilege actions (report submission, hiring).

---

### 18. i18n Escape Value Disabled
- **File:** `src/lib/i18n/index.ts` — `interpolation: { escapeValue: false }`
- **Issue:** HTML escaping in i18next is disabled globally.
- **Risk:** Safe now because translation strings are hardcoded. If server-provided strings are ever rendered via `t()` in a WebView context, this becomes an XSS vector.
- **Fix:** Remove `escapeValue: false`. If it was added to suppress React Native warnings, use `escapeValue: false` only in the React Native-specific interpolation config, not globally.

---

## Missing Features

| Feature | Impact |
|---------|--------|
| Push notifications (`expo-notifications`) | Workers miss all messages when the app is backgrounded — real-time model is broken for any user not actively in the app |
| Certificate pinning | All HTTPS traffic interceptable on site networks with proxies |
| Offline message queue / retry | Messages silently lost on poor connectivity; no draft persistence |
| Session timeout / background re-auth prompt | Indefinite background sessions on stolen devices |
| Biometric / PIN step-up auth | Shared device risk for sensitive operations |
| Short-lived signed media URLs | JWTs exposed in server access logs |

---

## Scalability Bottlenecks

1. **~50 concurrent users:** Home screen `loadData()` returns all users on every focus with no pagination and stacking listeners. Each socket event fires `loadData` N times where N = focus count.
2. **~100 concurrent users:** Voice base64-in-JSON pipeline produces large synchronous JSON payloads, spiking JS heap on both device and API server.
3. **~300 concurrent users:** After the first 15-minute token rotation cycle, all sockets reconnect simultaneously with stale tokens — a thundering herd of auth failures causing all workers to lose real-time updates at once.
4. **Structural ceiling:** Without push notifications, the entire real-time model fails for any user whose app is backgrounded. iOS kills background sockets in under 30 seconds.
