# Web Service — Audit Issues (Prioritized)

---

## CRITICAL

### 1. Access token in `sessionStorage`; user/role object in `localStorage`
- **Location**: `src/lib/auth/session.ts:3–9`
- **Issue**: `sessionStorage.setItem(ACCESS_KEY, accessToken)` and `localStorage.setItem(USER_KEY, JSON.stringify(user))`. Both stores are readable by any JavaScript on the page.
- **Risk**: Any XSS vector — supply-chain attack, browser extension, injected script — can exfiltrate the live access token. The `localStorage` user object contains the `role` field; every role check in the app reads it via `getStoredUser()`, so an attacker who can write to `localStorage` can self-elevate to admin without touching the server.
- **Fix**: Store the access token in JavaScript memory only (module-scoped variable or `useRef`), wiped on page close. Never store tokens or role data in `localStorage`. Role must be verified server-side via the signed JWT, not from a client-writable store.

---

### 2. JWT access token appended as a URL query parameter
- **Location**: `src/app/manage/media/page.tsx:29–31`, `src/app/manage/reports/page.tsx:353`, `src/app/manage/reports/page.tsx:364`
- **Issue**: `?token=${encodeURIComponent(tok)}` is appended to every media, photo, and video URL rendered in `<video>`, `<img>`, and `<audio>` elements.
- **Risk**: The live JWT is permanently logged in browser history, every HTTP server/proxy/CDN access log, `Referer` headers on subsequent navigation, and any screen recording or shared screenshot.
- **Fix**: The API must support `Authorization: Bearer` headers for media serving. For `<video>`/`<audio>` elements that cannot set headers natively, use short-lived signed media URLs — a backend endpoint that issues a one-time 30-second URL scoped to a specific file ID. Never put a long-lived JWT in a URL.

---

### 3. No server-side route protection — all auth guards are client-side `useEffect` redirects
- **Location**: `src/app/manage/layout.tsx:50–56`, `src/app/(dashboard)/layout.tsx:10–14` — no `middleware.ts` exists
- **Issue**: Every `/manage/*` page is a `'use client'` component that reads `getStoredUser()` in `useEffect` and calls `router.replace('/login')` if absent. There is no Next.js `middleware.ts` enforcing this at the edge.
- **Risk**: Admin JavaScript bundles are served to unauthenticated users. The check fires after the page renders, creating a flash window. Any issue preventing `useEffect` from running leaves pages permanently unprotected. Scrapers executing JavaScript can index protected page structure.
- **Fix**: Create `src/middleware.ts` that validates the `refresh_token` httpOnly cookie (or a server-readable access token) before the page renders and redirects to `/login` for all unauthenticated `/manage/*` requests.

---

### 4. Request bodies forwarded to the backend API without any validation
- **Location**: `src/app/api/auth/login/route.ts:15–19`, `src/app/api/auth/register/route.ts:15–19`
- **Issue**: `const body = await req.json() as unknown` is immediately forwarded as `body: JSON.stringify(body)`. The BFF does zero schema validation.
- **Risk**: Prototype pollution payloads, mass-assignment attacks (e.g., `role: 'admin'` injected into a register request), and arbitrarily large payloads all reach the backend unchecked.
- **Fix**: Add Zod validation in each BFF route before forwarding. Login: `{ email: z.string().email(), password: z.string().min(1).max(128) }`. Register: `{ email, password, displayName, role }` with an enum for role restricted to `['contractor', 'client']`. Return 400 on validation failure.

---

### 5. No rate limiting on authentication BFF endpoints
- **Location**: `src/app/api/auth/login/route.ts`, `src/app/api/auth/register/route.ts`
- **Issue**: No rate limiting, account lockout, CAPTCHA, or exponential backoff on `/api/auth/login` or `/api/auth/register`.
- **Risk**: Unlimited brute-force attacks against admin accounts. The register endpoint is also unprotected — anyone can create unlimited accounts and flood the user table.
- **Fix**: Apply `next-rate-limit` or Upstash Redis rate limiting: max 5 login attempts per IP per 15 minutes with exponential backoff. Consider restricting registration to admin-created invites for the web portal.

---

### 6. No security headers configured in `next.config.ts`
- **Location**: `apps/web/next.config.ts:1–7`
- **Issue**: The config is empty except for `transpilePackages`. No `headers()` function is defined.
- **Risk**: Missing headers expose the app to:
  - **XSS escalation** — no Content-Security-Policy
  - **Clickjacking** — no `X-Frame-Options` / `frame-ancestors`; the admin dashboard can be iframed
  - **MIME sniffing** — no `X-Content-Type-Options: nosniff`
  - **SSL stripping** — no `Strict-Transport-Security`
  - **Token leakage** — no `Referrer-Policy`; tokens in URLs are sent as `Referer` headers
  - **Sensor hijacking** — no `Permissions-Policy`
- **Fix**: Add a `headers()` export in `next.config.ts` applying the full OWASP recommended set to all routes (`/**`): `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`.

---

## HIGH

### 7. "Notify Team" button is a UI placebo — never calls any API
- **Location**: `src/app/manage/schedule/page.tsx:106–109`
- **Issue**: The `notifyTeam` function only sets a state timer to show "✅ Team Notified!" — it makes no API call. Workers are never actually notified.
- **Risk**: A construction safety risk. A manager sees a critical delay, clicks "Notify Team," believes 300 workers have been alerted, and takes no further action. No worker receives any notification. This could lead to workers arriving at changed site conditions, safety incidents, and legal liability.
- **Fix**: Either remove the button entirely, or implement it: call `POST /notifications` or a Socket.io broadcast. Show a real error if the call fails. Never render a success state for an operation that did not execute.

---

### 8. `NEXT_PUBLIC_API_URL` used in server-side route handlers, exposing the internal backend URL to clients
- **Location**: `src/app/api/auth/login/route.ts:4`, `refresh/route.ts:4`, `logout/route.ts:4`, `register/route.ts:4`, `manage/layout.tsx:9`, `manage/users/page.tsx:8`, `manage/media/page.tsx:9`, `manage/reports/page.tsx:10`
- **Issue**: The `NEXT_PUBLIC_` prefix causes the variable to be inlined into the client-side JavaScript bundle at build time. Using it in server-side route handlers means the internal backend URL is baked into the public bundle. The fallback `http://localhost:4501` is also hardcoded across multiple files.
- **Risk**: The internal backend service address is disclosed to every browser client. In production this leaks internal network topology. Since client components also use this variable directly for avatar/media URLs, the frontend bypasses the BFF entirely for data fetching, requiring the backend to be publicly accessible.
- **Fix**: Use a non-`NEXT_PUBLIC_` variable (e.g., `INTERNAL_API_URL`) in server-side route handlers. For client components, use a separate `NEXT_PUBLIC_` variable pointing to the public-facing URL.

---

### 9. Client-side role checks are the sole authorization gate for admin pages
- **Location**: `src/app/manage/layout.tsx:52`, `src/app/manage/media/page.tsx:43`, `src/app/manage/settings/page.tsx:22`
- **Issue**: `getStoredUser()?.role === 'admin'` reads from `localStorage`. The navigation guard and page rendering both depend entirely on this client-writable value.
- **Risk**: Any authenticated user can attempt operations on admin pages. An attacker who compromises `localStorage` can self-elevate to `admin` and bypass all client-side guards. The false sense of security is the primary risk — developers may assume protection that does not exist at this layer.
- **Fix**: The server-side middleware should read the role claim from the signed JWT, not from `localStorage`. The JWT is signed and tamper-proof. Client-side role checks are cosmetic UX only and must never be treated as a security boundary.

---

### 10. Avatar MIME type is attacker-controlled; validation is client-side only
- **Location**: `src/app/manage/users/page.tsx:186–188`
- **Issue**: `body.avatarMimeType = form.avatarFile.type` — `File.type` is the MIME type reported by the browser, which can be set to any string by the user. The file is base64-encoded and sent in JSON with this attacker-controlled value.
- **Risk**: An attacker can upload a malicious file while declaring `avatarMimeType: 'image/jpeg'`. If the storage or serving layer trusts the declared type, the file could be served with the wrong Content-Type and potentially executed.
- **Fix**: The backend must validate MIME type by magic bytes (first 4–16 bytes of the decoded file), never by the client-supplied field. The frontend `accept` attribute and type check are defense-in-depth only.

---

### 11. Entire file downloaded into browser memory before saving
- **Location**: `src/app/manage/media/page.tsx:115–133`
- **Issue**: `const blob = await res.blob()` fetches the entire file into the browser heap before triggering the download. Multiple files are processed sequentially in a `for` loop with no concurrency limit or per-file error handling.
- **Risk**: A 500 MB video file consumes 500 MB of browser heap. Selecting many large files can crash the browser tab. Individual file failures are swallowed by the catch block — the user receives no feedback about which files failed.
- **Fix**: Use short-lived signed download URLs from the backend (`GET /media/files/:id/download-url`). Set `a.href` to the signed URL and trigger click — no blob loading required. Report individual failures to the user.

---

### 12. PostgreSQL and Redis ports exposed on all network interfaces
- **Location**: `docker-compose.yml:9–10, 25`
- **Issue**: `ports: "5432:5432"` and `ports: "6379:6379"` bind to `0.0.0.0`, making the database and cache directly reachable from any host on the network.
- **Risk**: Combined with the hardcoded credentials (`POSTGRES_PASSWORD: constractor`), anyone on the same network can connect directly to the database without any application-layer controls.
- **Fix**: Bind to loopback only: `"127.0.0.1:5432:5432"`. Use Docker secrets or an `.env` file excluded from git for credentials.

---

### 13. Hardcoded PostgreSQL credentials in `docker-compose.yml`
- **Location**: `docker-compose.yml:7–9`
- **Issue**: `POSTGRES_PASSWORD: constractor` is hardcoded in the compose file, which is committed to the repository.
- **Risk**: Any person with repository read access can connect to the database. Combined with the exposed port above, this is a direct path to full database compromise.
- **Fix**: Reference as `${POSTGRES_PASSWORD}` in the compose file. Store the value in a `.env` file added to `.gitignore`.

---

## MEDIUM

### 14. No pagination — all endpoints fetch unbounded result sets
- **Location**: `src/app/manage/users/page.tsx:100–103`, `manage/dashboard/page.tsx:150–157`, `manage/media/page.tsx:57–59`, `manage/reports/page.tsx:74`, `manage/rfis/page.tsx:89–96`
- **Issue**: Every data-loading function calls the API with no `limit`, `offset`, or cursor parameters. All records are fetched on every page mount.
- **Risk**: With 300 workers, years of reports, and thousands of media files, page loads slow to a crawl and browser memory can be exhausted. Every navigation triggers a full-table query.
- **Fix**: Add cursor-based or offset pagination to all list views. Load the first 50 records with a "Load more" button or virtual scroll.

---

### 15. No error boundary in the component tree
- **Location**: `src/app/layout.tsx`, all manage and dashboard pages
- **Issue**: No React `ErrorBoundary` component wraps any dashboard page or the manage layout.
- **Risk**: A runtime error from any component — including malformed API responses — crashes the entire application with a blank screen. There is no graceful degradation or user-facing error message.
- **Fix**: Wrap `ManageLayout` children and each major page in a React `ErrorBoundary`. Add `error.tsx` files per route segment as Next.js 15 supports.

---

### 16. Refresh token cookie settings duplicated across three files
- **Location**: `src/app/api/auth/login/route.ts:6–12`, `src/app/api/auth/refresh/route.ts:5–11`, `src/app/api/auth/register/route.ts:6–12`
- **Issue**: The `REFRESH_COOKIE` object — including `maxAge`, `sameSite`, `httpOnly`, `secure`, and `path` — is copy-pasted identically across three files.
- **Risk**: When the refresh token lifetime or any cookie attribute needs to change, one or more files will be missed, causing inconsistent session behavior that is difficult to debug in production.
- **Fix**: Extract into `src/lib/auth/cookies.ts` as a single exported constant and import it in all three route handlers.

---

### 17. Projects and locations are hardcoded in multiple pages
- **Location**: `src/app/manage/reports/page.tsx:13–20`, `src/app/manage/schedule/page.tsx:21`, `src/app/manage/rfis/page.tsx:25`
- **Issue**: `const PROJECTS = ['Tower A – Tel Aviv', ...]` is hardcoded identically in three separate files.
- **Risk**: A report can be submitted for a project that does not exist in the database. Adding a new project requires a code deployment. The hardcoded list breaks multi-tenancy entirely.
- **Fix**: Fetch projects from a `GET /projects` API endpoint. Create the projects module if it does not yet exist.

---

### 18. `socket.ts` is dead code — never imported or used
- **Location**: `src/lib/socket.ts`
- **Issue**: The Socket.io client module is present and sets up a singleton connection, but no page in the web app imports it.
- **Risk**: Increases bundle size. Signals that real-time functionality was planned but never implemented — managers have no live alerts for critical delays, safety incidents, or new field reports.
- **Fix**: Either implement real-time alerts (connect on login, subscribe to site-level events, show a notification badge in the header) or delete the file.

---

## LOW

### 19. `📷 Add Photo` button has no click handler
- **Location**: `src/app/manage/reports/page.tsx:207–210`
- **Issue**: The button renders with no `onClick`. The API supports photo uploads — `photoUrl` is rendered in the detail panel — but the upload UI does not exist.
- **Fix**: Implement the file input and upload flow, or remove the button. Do not show a UI element that does nothing.

---

### 20. `console.error` in production code exposes internal error details
- **Location**: `src/app/manage/media/page.tsx:129`
- **Issue**: `console.error('[media] download failed for file:', err)` runs in a production browser, exposing internal error details and API URLs in the browser console.
- **Fix**: Remove or gate behind a `NODE_ENV === 'development'` check.

---

### 21. `(dashboard)` route group has no role check
- **Location**: `src/app/(dashboard)/layout.tsx:10–14`
- **Issue**: This layout checks only that `getStoredUser()` is truthy — it does not check the user's role. Any authenticated user including `member`-role workers could navigate to `/dashboard` or `/jobs/*` if they know the URL.
- **Fix**: Add a role check consistent with the manage layout, or explicitly document that this route group is intentionally accessible to all authenticated roles.
