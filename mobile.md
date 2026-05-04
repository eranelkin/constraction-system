# Mobile Build & Distribution Guide

Step-by-step reference for building, distributing, and testing the Constractor mobile app on real devices. Covers Android APK side-loading, iOS ad-hoc and TestFlight, and structured A/B testing with two user groups.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| [Expo account](https://expo.dev) | Free. Needed to use EAS Build. |
| EAS CLI | `npm install -g eas-cli` |
| Apple Developer account | $99/year. **Required for any iOS real-device install.** |
| Public API URL | The API URL is baked in at build time — `localhost` won't work. See Phase 0. |

---

## Phase 0 — Deploy the API

`EXPO_PUBLIC_API_URL` is bundled into the binary at compile time. Every tester's device hits this URL directly. It must be a stable public HTTPS endpoint **before** you run any build.

### Option A — Railway (recommended for ongoing testing)

1. Go to [railway.app](https://railway.app) and create a project.
2. Add a PostgreSQL service and a Redis service from the Railway template library.
3. Deploy the API via GitHub or by linking the repo — Railway detects the `docker-compose.yml` or you can deploy the `apps/api` folder directly.
4. Set all required env vars (copy from `apps/api/.env.example`) in the Railway dashboard.
5. Railway gives you a permanent HTTPS URL like `https://constractor-api.up.railway.app`.
6. Paste that URL into `eas.json` under `env.EXPO_PUBLIC_API_URL`.

### Option B — ngrok (same-day sessions only)

```bash
ngrok http 4501
# → Forwarding  https://abc123.ngrok-free.app → localhost:4501
```

- The URL changes every session on the free tier.
- Only practical when all testers test at the same time while your laptop stays online.
- Update `eas.json` with the new URL before each build session.

---

## Phase 1 — One-Time EAS Setup

Run these once per developer machine:

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to your Expo account
eas login

# Link this project (run from apps/mobile)
cd apps/mobile
eas init
```

`eas init` writes a `projectId` into `app.json` under `expo.extra.eas`. Commit that change.

---

## Phase 2 — Build Profiles

Build profiles live in `apps/mobile/eas.json`. The current `preview` profile is the internal-testing configuration.

```json
{
  "cli": {
    "version": ">= 14.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://YOUR_API_URL_HERE"
      },
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": false
      }
    }
  }
}
```

**Key flags explained:**

| Flag | Value | Why |
|---|---|---|
| `distribution` | `internal` | Side-loadable APK for Android; ad-hoc provisioning for iOS |
| `buildType` | `apk` | Produces a directly installable file (not a Play Store `.aab`) |
| `env.EXPO_PUBLIC_API_URL` | your URL | Baked into the binary at build time |

---

## Phase 3 — Building

All builds run in the EAS cloud. No Xcode or Android Studio needed locally. Build time is approximately 15–20 minutes.

```bash
# From apps/mobile

# Android
eas build --profile preview --platform android

# iOS
eas build --profile preview --platform ios

# Both at once
eas build --profile preview --platform all
```

When the build finishes, EAS prints a download URL and a QR code. Share the URL directly with testers.

### Monorepo note
EAS detects `pnpm-workspace.yaml` at the repo root and automatically installs all workspace packages (including `@constractor/types`) before bundling. No extra configuration needed.

---

## Phase 4 — Installing on Devices

### Android

1. On the test device: **Settings → Security → Install unknown apps** → enable for your browser.
2. Open the EAS download URL on the device (or scan the QR code).
3. Download the `.apk` → tap to install → accept the prompt.

To share with multiple testers: paste the EAS build URL in your team chat — each person downloads and installs independently.

### iOS — ad-hoc (up to 100 devices)

> Requires Apple Developer account.

1. Before building, collect the **UDID** of each test device:
   - On the device: open [udid.io](https://udid.io) in Safari → follow the prompt → copy the UDID.
   - OR connect to Mac → Finder → select device → click the device identifier until UDID appears.
2. Register UDIDs in [Apple Developer Portal](https://developer.apple.com) → Certificates, IDs & Profiles → Devices → `+`.
3. Run the iOS build — EAS will prompt you to select provisioning style; choose **ad-hoc**.
4. EAS handles certificate and provisioning profile creation automatically (`eas credentials`).
5. When the build finishes, send the EAS install URL to testers. On iPhone: open the URL in Safari → tap **Install** → trust the profile in Settings → General → VPN & Device Management.

### iOS — TestFlight (recommended for >3 testers)

1. Change the iOS profile in `eas.json` to `"distribution": "store"`.
2. Build: `eas build --profile preview --platform ios`
3. Submit to App Store Connect: `eas submit --platform ios`
4. In [App Store Connect](https://appstoreconnect.apple.com) → TestFlight → Internal Testing → add testers by Apple ID email.
5. Testers receive an email → accept invite → install the **TestFlight** app → install Constractor from inside it.
6. TestFlight also handles OTA updates automatically when you push a new build.

---

## Phase 5 — A/B Testing

A/B testing here means distributing the app to **two distinct user groups** with different roles, languages, or feature configurations, and collecting structured feedback from each. This maps directly to how Constractor works: Hebrew-speaking field workers and English-speaking managers have very different usage patterns.

### Define your groups

| Group | Profile | What to test |
|---|---|---|
| **Group A — Field Workers** | Hebrew language, mobile-first, voice messages | Message legibility, translation accuracy, voice recording UX |
| **Group B — Managers** | English language, reads translated messages | Badge counts, conversation list, readability of translated content |

### Create separate build profiles for each group

Add two profiles to `eas.json` — one per group. The key difference is the `EXPO_PUBLIC_API_URL` can point to different environments, and you can add any feature-flag env vars:

```json
{
  "build": {
    "group-a": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://constractor-api.up.railway.app",
        "EXPO_PUBLIC_GROUP": "A"
      },
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "group-b": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://constractor-api.up.railway.app",
        "EXPO_PUBLIC_GROUP": "B"
      },
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    }
  }
}
```

Build and distribute each group separately:

```bash
eas build --profile group-a --platform android   # → share APK with Group A testers
eas build --profile group-b --platform android   # → share APK with Group B testers
```

### What to validate in each group

**Group A checklist (workers):**
- [ ] Login works with their credentials
- [ ] Messages from managers appear in Hebrew (translation correct)
- [ ] Voice recording transcribes correctly in Hebrew
- [ ] Notification sound plays on incoming message
- [ ] Unread badge clears when conversation is opened

**Group B checklist (managers):**
- [ ] Login works with their credentials
- [ ] Conversations list shows correct unread counts in real time
- [ ] Messages from Hebrew workers appear translated to English
- [ ] Group conversations work correctly
- [ ] No performance issues with many conversations

### Collecting feedback

- Use a shared spreadsheet or Notion page per group — one row per tester, columns for each checklist item (✅ / ❌ / ⚠️ + notes).
- Add testers to a dedicated Slack/WhatsApp group per group so they can send screenshots.
- Ask testers to note: device model, OS version, and exact steps to reproduce any issue.

### Pushing updates to testers

When you fix a bug or add a feature during the testing phase, you have two options:

**Option A — New full build (any change)**
```bash
# Bump version in app.json first
eas build --profile preview --platform android
# Share new download link
```

**Option B — EAS Update (JS-only changes, no native changes)**

EAS Update pushes a new JavaScript bundle over-the-air. No reinstall needed by testers — the app updates silently on next launch.

```bash
# Install expo-updates if not already added
npx expo install expo-updates

# Push an OTA update
eas update --branch preview --message "fix: translation flicker on Android"
```

> Use EAS Update for bug fixes in React components, logic changes, and UI tweaks. Use a full build when you change `app.json`, add a new native package, or update the Expo SDK version.

---

## Quick Reference

```bash
# One-time setup
npm install -g eas-cli
eas login
cd apps/mobile && eas init

# Build for testers
eas build --profile preview --platform android    # Android APK
eas build --profile preview --platform ios        # iOS ad-hoc

# Push a JS-only hotfix (no reinstall)
eas update --branch preview --message "description"

# Check build status
eas build:list
```

---

## File Locations

| File | Purpose |
|---|---|
| `apps/mobile/eas.json` | EAS build profiles |
| `apps/mobile/app.json` | App metadata, bundle ID, icon, splash |
| `apps/mobile/src/assets/icon.png` | App icon (1024×1024) — replace placeholder with real branding |
| `apps/mobile/src/assets/splash.png` | Splash screen (1242×2688) — replace placeholder with real branding |
| `apps/mobile/.env` | Local dev API URL (not used in EAS builds) |
