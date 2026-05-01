# Constractor — Session Context

> **Purpose:** Cross-machine continuity. Read this before starting any new session.
> Update this file on demand: ask Claude to "update Session.md" after significant work.
> Last updated: 2026-05-01

---

## 1. Project Vision

Multi-team construction site management platform.
- **Mobile-first** — on-site workers (contractors) use phones, often multilingual
- **Desktop/back-office** — managers and admins use the web app to post jobs, manage teams, assign tasks
- **Two primary modules:** Messages and Tasks (see Phase 3 below)
- **UX principle:** Comic/construction style — bold, colored, rounded, "wow" effect. Large touch targets. Friendly for non-tech workers.

---

## 2. Monorepo Layout

```
/
├── apps/
│   ├── api/          Express + TypeScript backend (:4501)
│   ├── web/          Next.js 15 App Router (:4500)
│   └── mobile/       Expo 54 + Expo Router v6 (Expo Go / Android / iOS, port 4502)
├── packages/
│   ├── types/        @constractor/types — ALL shared types, zero runtime deps
│   └── config/       @constractor/config — Zod env validation, single typed config object
├── docker-compose.yml   PostgreSQL :5432 + Redis :6379
└── Session.md           ← this file
```

---

## 3. Tech Stack & Versions

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 22.x |
| Package manager | pnpm workspaces | 9.x |
| API | Express + TypeScript (ESM NodeNext) | Express 4.21 |
| Database | PostgreSQL (Docker) | 16-alpine |
| Auth | JWT (15min) + rotating refresh tokens (30d, SHA-256 hashed) | jsonwebtoken 9.x |
| Web | Next.js App Router | 15.x |
| Mobile | Expo SDK | **54.0.34** |
| Mobile framework | Expo Router | **v6.0.23** |
| React (mobile) | React | **19.1.0** (MUST match react-native-renderer) |
| React Native | React Native | **0.81.5** |
| Shared types | @constractor/types | workspace |

**Critical React version note:** `react` must stay at exactly `19.1.0` for mobile. React Native 0.81.x ships `react-native-renderer@19.1.0` internally — any mismatch crashes the app with an "Incompatible React versions" error.

---

## 4. How to Run (Every Machine)

### Prerequisites
- Docker Desktop running
- pnpm installed globally (`npm i -g pnpm`)
- Node 22.x

### First-time setup
```bash
git clone <repo>
cd Constractor-system
docker compose up -d                               # start Postgres + Redis
cp .env.example apps/api/.env                      # copy env template
pnpm install                                        # install all workspaces
pnpm --filter @constractor/types build             # build types package
pnpm --filter @constractor/config build            # build config package
pnpm --filter @constractor/api run db:migrate      # run all 5 migrations
```

### Daily start
```bash
docker compose up -d
pnpm dev                                           # runs API + web together (turbo)
pnpm --filter @constractor/mobile start           # Expo — run separately, scan QR with Expo Go
```

### Mobile physical device
- Phone and Mac must be on the same Wi-Fi
- Set `EXPO_PUBLIC_API_URL=http://<your-mac-ip>:4501` in `apps/mobile/.env`
- Check your Mac IP: `ipconfig getifaddr en0`
- If QR scan doesn't work on LAN, use: `pnpm --filter @constractor/mobile start --tunnel`

### Important: API dev script
The dev script is `node --env-file=.env --import tsx/esm --watch src/main.ts` in `apps/api/package.json`.
Do NOT change it back to `tsx watch` — that doesn't load `.env` and the config validator will reject startup.

---

## 5. Architecture — Key Decisions

### Provider abstraction (do NOT bypass)
Every external concern is behind a typed interface in `packages/types/src/providers/`.
Concrete implementations live in `apps/api/src/providers/`.
Switch via ENV flags — never change business logic to swap providers.

| Interface | Dev (default) | Production (future) |
|---|---|---|
| `IAuthProvider` | `JWTAuthProvider` | same |
| `IAIProvider` | `MockAIProvider` | `OpenAIProvider` |
| `IStorageProvider` | `LocalStorageProvider` | `S3StorageProvider` |
| `IQueueProvider` | `InMemoryQueueProvider` | `BullMQProvider` |
| `IRealtimeProvider` | `InMemoryRealtimeProvider` | `SocketIOProvider` |
| `ISpeechProvider` | `MockSpeechProvider` | `GroqSpeechProvider` |

ENV flags (all `false` = zero cost dev): `USE_REAL_AI`, `USE_REAL_STORAGE`, `USE_REAL_QUEUE`, `USE_REAL_REALTIME`, `USE_REAL_SPEECH`

### Dependency injection
`apps/api/src/container.ts` is the single wiring point. All routers receive the full `AppContainer`.
Pattern: `export function createXxxRouter(container: AppContainer): Router { ... }`

### Database
Raw SQL only — no ORM. `IDatabase` interface → `PostgreSQLAdapter`.
Repositories get `IDatabase` via constructor. Transactions: `db.transaction(async (tx) => { ... })`.
All params positional: `$1, $2, ...` (PostgreSQL syntax).

### TypeScript constraints (apps/api)
- `"module": "NodeNext"` — all local imports MUST use `.js` extension
- `exactOptionalPropertyTypes: true` — never assign `undefined` to optional props, just omit; use spread with condition: `...(value && { key: value })`
- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`, always null-check

### Auth flow
`POST /auth/login` → returns `{ user: AuthUser, tokens: { accessToken, refreshToken } }`
`POST /auth/refresh` → old refresh token revoked, new pair issued (single-use rotation)
If a revoked refresh token is presented → ALL user sessions immediately revoked (security)
Protect route: `router.get('/path', authenticate, requireRole('manager'), handler)`

### Roles (IMPORTANT — use these exact strings everywhere)
- `manager` — Back-office user. Posts jobs, manages teams, manages users. Lands on `/manage/users` after login.
- `member` — On-site worker/contractor. Applies to jobs, receives tasks. Mobile-primary.
- `admin` — Full access. Can manage admin accounts and is the only one who can delete the last admin.

---

## 6. Database Schema

### Migration 001 — users & auth
```sql
users (id UUID PK, email TEXT UNIQUE, password_hash, display_name, role, email_verified, created_at)
refresh_tokens (id, user_id FK, token_hash UNIQUE, expires_at, revoked_at, created_at, user_agent, ip_address)
```

### Migration 002 — messaging
```sql
conversations (id UUID PK, created_at, updated_at)
conversation_participants (conversation_id FK, user_id FK, last_read_at) -- composite PK
messages (id UUID PK, conversation_id FK, sender_id FK, body TEXT, created_at)
-- trigger: fn_touch_conversation — updates conversations.updated_at on new message
```

### Migration 003 — jobs
```sql
jobs (id UUID PK, client_id FK, title, description, budget NUMERIC, location, status, assigned_contractor_id FK, created_at, updated_at)
-- status CHECK: 'open' | 'assigned' | 'completed' | 'cancelled'
job_applications (id UUID PK, job_id FK, contractor_id FK, cover_note, status, created_at)
-- status CHECK: 'pending' | 'accepted' | 'rejected'
-- UNIQUE(job_id, contractor_id) — one application per contractor per job
```

### Migration 004 — rename roles
```sql
-- Renamed: client → manager, contractor → member
-- role CHECK: 'admin' | 'manager' | 'member'
```

### Migration 005 — user language & avatar
```sql
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN avatar_data BYTEA;
ALTER TABLE users ADD COLUMN avatar_mime_type TEXT;
```

Run migrations: `pnpm --filter @constractor/api run db:migrate`
The runner is idempotent — safe to re-run (all DDL uses `IF NOT EXISTS` / `ALTER ... IF NOT EXISTS`).

---

## 7. All API Endpoints

All routes except `/health` and `GET /users/:id/avatar` require `Authorization: Bearer <token>`.

```
GET  /health                                   → { status, version, timestamp }

POST /auth/register                            → { user, tokens }  (body: email, password, displayName, role)
POST /auth/login                               → { user, tokens }  (body: email, password)
POST /auth/refresh                             → { tokens }        (body: refreshToken)
POST /auth/logout                              → 204               (body: refreshToken)
GET  /auth/me                                  → { user }
GET  /auth/users                               → { users: ContactUser[] }  (all users except self; id+displayName+role only)

GET  /users                                    → { users: PublicUser[] }   (admin/manager only)
POST /users                                    → { user }          (admin/manager; body: email, password, displayName, role, language?, avatar?, avatarMimeType?)
PATCH /users/:id                               → { user }          (admin/manager; same optional fields; avatar: null clears it)
DELETE /users/:id                              → 204               (admin/manager)
GET  /users/:id/avatar                         → image bytes       (PUBLIC — no auth; Cache-Control: 3600s)

POST /speech/transcribe                        → { text }          (auth; body: { audio: base64, mimeType })

GET  /jobs                                     → { jobs: JobSummary[] }    (open jobs only)
POST /jobs                                     → { job: JobDetail }        (manager only)
GET  /jobs/:id                                 → { job: JobDetail }        (member sees only own application)
PATCH /jobs/:id                                → { job: JobDetail }        (manager only; status: 'completed'|'cancelled')
POST /jobs/:id/apply                           → { application }           (member only; 409 if duplicate)
POST /jobs/:id/hire/:applicantId               → { job: JobDetail }        (manager only; creates conversation automatically)

GET  /my/jobs                                  → { jobs: JobSummary[] }    (manager: own jobs)
GET  /my/applications                          → { applications[] }        (member: own applications + job info)

GET  /messaging/conversations                  → { conversations: ConversationSummary[] }
POST /messaging/conversations                  → { conversation }          (body: participantId; finds or creates)
GET  /messaging/conversations/:id/messages     → { messages[] }            (query: ?after=<messageId> for polling)
POST /messaging/conversations/:id/messages     → { message }               (body: body)
POST /messaging/conversations/:id/read         → 204
```

### /users permission rules
- Managers cannot create, edit, or delete `admin` accounts.
- Cannot change your own role or delete your own account.
- Cannot delete the last remaining admin account.
- Avatar: max 2 MB, types: jpeg/png/webp/gif. Stored as `bytea` in DB.

### /speech/transcribe notes
- Body: `{ audio: base64string, mimeType: 'audio/m4a' }`, max decoded size 10 MB
- Dev: `MockSpeechProvider` returns a fixed string after 900ms (no API key needed)
- Prod: `GroqSpeechProvider` uses Groq Whisper free tier (7,200 sec/day free, model: `whisper-large-v3-turbo`)
- Enable: `USE_REAL_SPEECH=true` + `GROQ_API_KEY=<key>` in `apps/api/.env`
- Get free key at: https://console.groq.com

---

## 8. Shared Types Package

`packages/types/src/` structure:
```
providers/
  IAuthProvider.ts     AuthUser, SignUpPayload, SignInResult, IAuthProvider
  IAIProvider.ts       TranslationResult, SpeechToTextResult, IAIProvider
  ISpeechProvider.ts   ISpeechProvider  ← NEW
  IStorageProvider.ts
  IQueueProvider.ts
  IRealtimeProvider.ts
domain/
  User.ts              User, PublicUser, CreateUserDTO, UpdateUserDTO
  Job.ts               Job, JobApplication
  Message.ts           Message, Conversation, ConversationParticipant
api/
  auth.dto.ts          RegisterRequestDTO, LoginRequestDTO, AuthResponseDTO, MeResponseDTO,
                       ContactUser, ListUsersResponse
  users.dto.ts         ListUsersResponse, UserResponse, CreateUserRequest, UpdateUserRequest
  jobs.dto.ts          JobSummary, JobDetail, JobApplicationDetail, CreateJobRequest, ...
  messaging.dto.ts     ConversationSummary, Message, StartConversationRequest, ...
```

### Key type shapes (after latest changes)
```typescript
// User (internal domain)
interface User { id, email, passwordHash, displayName, role, language, emailVerified, createdAt }

// PublicUser (API responses — no password, includes hasAvatar)
interface PublicUser { id, email, displayName, role, language, emailVerified, createdAt, hasAvatar: boolean }

// ContactUser (from GET /auth/users — minimal, for messaging)
interface ContactUser { id, displayName, role }

// CreateUserDTO (repository layer)
type CreateUserDTO = { email, passwordHash, displayName, role, language, avatarData?, avatarMimeType? }

// UpdateUserDTO (repository layer)
type UpdateUserDTO = { displayName?, email?, passwordHash?, role?, language?, emailVerified?,
                       avatarData?: Buffer | null, avatarMimeType?: string | null }
```

After editing types, always rebuild: `pnpm --filter @constractor/types build`
After editing config, always rebuild: `pnpm --filter @constractor/config build`

---

## 9. Web App (Next.js) — Current State

The web app is the **back-office** for managers and admins. Members (workers) use mobile only — the web login rejects the `member` role.

### Routes
```
/                              → redirects to /login

/(auth)/login                  → Sign In ✅ comic style; managers/admins only; redirects to /manage/users
/(auth)/register               → Sign Up ✅ comic style, visual role picker

/(dashboard)/dashboard         → Messaging hub (Chats + People tabs) ✅
/(dashboard)/jobs              → Job board (plain style)
/(dashboard)/jobs/new          → Post a job (manager only, plain style)
/(dashboard)/jobs/[id]         → Job detail + apply/hire (plain style)
/(dashboard)/my-jobs           → My jobs / my applications (plain style)

/manage/users                  → User management ✅ DONE — full CRUD + language + avatar
/manage/tasks                  → Tasks management (placeholder — coming soon)
```

### /manage/users — User Management (completed)
Full CRUD for users, accessible to `manager` and `admin` roles only.

**Fields per user:** display name, email, password, role, **mother tongue language**, **profile picture**

**Language:** dropdown of 14 languages (en, he, ar, ru, es, fr, de, pt, ro, tr, zh, hi, am, tl). Stored as ISO 639-1 code. Used for STT language and future message translation.

**Avatar:** upload jpeg/png/webp/gif up to 2 MB. Stored as `bytea` in DB. Served publicly at `GET /users/:id/avatar`. Table shows thumbnail. Edit form shows current avatar with delete option. Live preview on file select.

**API calls:** `GET /users`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id`, `GET /users/:id/avatar`

**File:** `apps/web/src/app/manage/users/page.tsx`

### Design system — `apps/web/src/app/globals.css`
CSS classes:
- `.auth-bg` — full-screen orange→yellow gradient + halftone dot overlay
- `.auth-card` / `.auth-card-header` / `.auth-card-body` — comic card
- `.comic-input`, `.comic-select` — thick-border inputs
- `.comic-btn-primary` — orange pill button, `.comic-btn-secondary` — white pill button
- `.role-card` / `.role-card.selected` — visual role picker cards
- `.field-label`, `.error-banner`, `.spinner`

### Color tokens (globals.css :root)
- `--orange: #FF6B2B`, `--yellow: #FFD93D`, `--navy: #1C1C2E`, `--cream: #FFFBF2`
- `--border: 2.5px solid var(--navy)`, `--shadow-md: 5px 5px 0 var(--navy)`

### Session storage (web)
- `sessionStorage`: `access_token` (cleared when tab closes)
- `localStorage`: `refresh_token`, `auth_user`
- Token refresh NOT yet implemented — after 15 min access token expires, user must re-login

---

## 10. Mobile App (Expo) — Current State

Mobile app is primarily for **workers (members)**. Comic/construction design with orange/yellow/navy.

### Navigation flow
```
Landing (index.tsx)
  → (auth)/login  → /(home)   ← main hub after login
  → (auth)/register → /(home)

/(home)/index.tsx      Main hub with Msg / Tasks tabs
/(messages)/[id].tsx   WhatsApp-style chat screen
/(jobs)/index.tsx      Job board
/(jobs)/[id].tsx       Job detail
```

### Screens

**Landing (`index.tsx`):** Login / Register buttons. Plain style (not yet redesigned).

**Login (`(auth)/login.tsx`):** Form → saves session → navigates to `/(home)`.

**Register (`(auth)/register.tsx`):** Role picker (member/manager) → saves session → navigates to `/(home)`. Roles are `member` and `manager` (fixed from old wrong values `contractor`/`client`).

**Home (`(home)/index.tsx`) — ✅ BUILT:**
- Comic-style orange header "🏗️ Constractor"
- Two pill tabs: 💬 **Msg** and ✅ **Tasks**
- Msg tab: loads all team users from `GET /auth/users`; each row shows emoji avatar (deterministic per index), display name, role badge (👷/👔/⭐); tap → finds/creates conversation → navigates to chat
- Tasks tab: "Coming Soon" comic card 🚧
- Press-down shadow animation on cards
- Avatar emojis: `['🐻','🦊','🐯','🦁','🐸','🦄','🐙','🦋','🐺','🦅','🦉','🐨']`
- Avatar colors: `['#FF6B2B','#FFD93D','#4ECDC4','#45B7D1','#96CEB4','#DDA0DD','#FF9FF3','#54A0FF']`

**Chat (`(messages)/[id].tsx`) — ✅ BUILT:**
- Accepts params: `id` (conversation ID), `userName`, `avatarEmoji`, `avatarColor`
- Orange header with ‹ back button, avatar circle, user name
- WhatsApp-style message bubbles: orange (self, right) / white (others, left) with navy comic borders
- Mini avatar next to incoming messages
- Input bar: pill-shaped text input
- **Send/Voice toggle button:** when input empty → yellow 🎙️ voice button; when typing → orange ➤ send button
- 3-second message polling

**Voice-to-text modal (in chat screen) — ✅ BUILT:**
Three-phase flow:
1. **Recording:** Tap 🎙️ → permission request → pulsing mic circle, live timer, tap square stop button
2. **Transcribing:** Spinner + "Transcribing your voice…"
3. **Editing:** Red ✕ cancel | White editable text card | Green ➤ send
- Audio recorded with `expo-av` (m4a format)
- File read as base64 with `expo-file-system`
- Sent to `POST /speech/transcribe` → returns transcribed text
- User can edit text before sending

### Mobile dependencies added
- `expo-av` (~15.0.2) — audio recording
- `expo-file-system` (~18.0.12) — read audio file as base64
- Microphone permission configured in `app.json` via `expo-av` plugin

### Token storage (mobile)
`apps/mobile/src/lib/auth/token-storage.ts` — uses `expo-secure-store`:
`saveSession`, `getAccessToken`, `getRefreshToken`, `getStoredUser`, `clearSession`

### API client (mobile)
`apps/mobile/src/lib/api-client.ts` — reads `EXPO_PUBLIC_API_URL`.
`ApiRequestError` class + `apiRequest<T>()` function. Path alias `@/*` → `./src/*`.

### Known issues / TODO on mobile
1. `(messages)/index.tsx` — old "paste user ID" screen still exists but is no longer the entry point (home screen handles contact list). Can be cleaned up or repurposed.
2. No comic design on login screen yet (plain style).
3. Jobs screens (`(jobs)/`) are plain style — not yet redesigned.
4. Avatar images from DB not yet shown on mobile (only emoji avatars used).
5. User language not yet wired to STT — Groq is called without specifying language (defaults to auto-detect).

---

## 11. Planned Phases

### Phase 3 — In Progress / Next Up

**A. Tasks module** — NEXT PRIORITY
Core concept: a Job can have multiple Tasks assigned to specific workers.

DB schema (migration 006):
```sql
tasks (
  id UUID PK,
  job_id UUID FK jobs(id),
  assigned_to UUID FK users(id),   -- member/worker
  created_by UUID FK users(id),    -- manager
  title TEXT,
  description TEXT,
  status TEXT CHECK IN ('todo', 'in_progress', 'done', 'blocked'),
  priority TEXT CHECK IN ('low', 'normal', 'high', 'urgent'),
  due_date TIMESTAMPTZ,
  created_at, updated_at
)
```

API to add:
```
GET  /jobs/:id/tasks    → { tasks[] }   (participants only)
POST /jobs/:id/tasks    → { task }      (manager only)
PATCH /tasks/:id        → { task }      (assigned member: status only; manager: all fields)
DELETE /tasks/:id       → 204           (manager only)
```

Web UX: `/manage/tasks` — manager sees all tasks with status filters.
Mobile UX: Tasks tab in home screen — worker sees their assigned tasks as status cards.

**B. Wire language into features**
- STT: pass `user.language` to Groq transcription so it recognizes the right language
- Translation: when receiving a message, optionally translate to recipient's language using `IAIProvider.translate()`
- Mobile: show real DB avatar (from `GET /users/:id/avatar`) in home screen list and chat header

### Phase 4 — Future
- Real-time messaging (replace 3-second polling with WebSocket via `SocketIOProvider`)
- Push notifications (Expo Notifications) for messages and task assignments
- Multi-language UI (i18n for mobile screens)
- File attachments on tasks/messages (photos from site) — S3StorageProvider

---

## 12. Outstanding Bugs / Known Issues

1. **Web: access token expiry** — no refresh logic. After 15 min, API calls return 401 silently. Fix: implement token refresh in `apps/web/src/lib/api-client.ts` using `POST /auth/refresh`.

2. **Web: jobs/dashboard pages not redesigned** — `/jobs`, `/jobs/new`, `/jobs/[id]`, `/my-jobs`, `/dashboard` use plain inline styles, not the comic design system.

3. **Mobile: login screen plain style** — `(auth)/login.tsx` is not yet comic-styled.

4. **Mobile: language not passed to STT** — `POST /speech/transcribe` is called without the user's language, so Groq auto-detects. Should read user's `language` field from stored session and pass it.

5. **Mobile: avatar not shown from DB** — home screen and chat use emoji-based avatars only. Real user photos from DB are not fetched yet.

---

## 13. File Locations Cheat Sheet

| What | Where |
|---|---|
| API entry | `apps/api/src/main.ts` |
| Route registration | `apps/api/src/app.ts` |
| DI container | `apps/api/src/container.ts` |
| DB migrations | `apps/api/src/database/migrations/00x_*.sql` |
| Users module (API) | `apps/api/src/modules/users/` |
| Speech module (API) | `apps/api/src/modules/speech/speech.router.ts` |
| Speech providers | `apps/api/src/providers/speech/` |
| Shared types | `packages/types/src/` |
| Web globals.css | `apps/web/src/app/globals.css` |
| Web session utils | `apps/web/src/lib/auth/session.ts` |
| Web API client | `apps/web/src/lib/api-client.ts` |
| Web user management | `apps/web/src/app/manage/users/page.tsx` |
| Mobile home screen | `apps/mobile/src/app/(home)/index.tsx` |
| Mobile chat screen | `apps/mobile/src/app/(messages)/[id].tsx` |
| Mobile token storage | `apps/mobile/src/lib/auth/token-storage.ts` |
| Mobile API client | `apps/mobile/src/lib/api-client.ts` |
| Mobile env | `apps/mobile/.env` |
| API env | `apps/api/.env` |
