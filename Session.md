# Constractor — Session Context

> **Purpose:** Cross-machine continuity. Read this before starting any new session.
> Update this file on demand: ask Claude to "update Session.md" after significant work.
> Last updated: 2026-04-30

---

## 1. Project Vision

Multi-team construction site management platform.
- **Mobile-first** — on-site workers (contractors) use phones, often multilingual
- **Desktop/back-office** — managers (clients) post jobs, track teams, manage tasks
- **Two primary modules:** Messages and Tasks (see Phase 3 below)
- **UX principle:** Comic/construction style — bold, colored, rounded, "wow" effect. Large touch targets. Friendly for non-tech workers.

---

## 2. Monorepo Layout

```
/
├── apps/
│   ├── api/          Express + TypeScript backend (:4000)
│   ├── web/          Next.js 15 App Router (:3000)
│   └── mobile/       Expo 54 + Expo Router v6 (Expo Go / Android / iOS)
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
pnpm --filter @constractor/api run db:migrate      # run all 3 migrations
```

### Daily start
```bash
docker compose up -d
pnpm --filter @constractor/api dev       # API :4000  (loads .env automatically)
pnpm --filter @constractor/web dev       # Web :3000
pnpm --filter @constractor/mobile start  # Expo — scan QR with Expo Go on phone
```

### Mobile physical device
- Phone and Mac must be on the same Wi-Fi
- Set `EXPO_PUBLIC_API_URL=http://<your-mac-ip>:4000` in `apps/mobile/.env`
- Check your Mac IP: `ipconfig getifaddr en0`
- Current configured IP: `192.168.1.67` (update if network changes)

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

ENV flags (all `false` = zero cost dev): `USE_REAL_AI`, `USE_REAL_STORAGE`, `USE_REAL_QUEUE`, `USE_REAL_REALTIME`

### Dependency injection
`apps/api/src/container.ts` is the single wiring point. All routers receive the full `AppContainer`.
Pattern: `export function createXxxRouter(container: AppContainer): Router { ... }`

### Database
Raw SQL only — no ORM. `IDatabase` interface → `PostgreSQLAdapter`.
Repositories get `IDatabase` via constructor. Transactions: `db.transaction(async (tx) => { ... })`.
All params positional: `$1, $2, ...` (PostgreSQL syntax).

### TypeScript constraints (apps/api)
- `"module": "NodeNext"` — all local imports MUST use `.js` extension
- `exactOptionalPropertyTypes: true` — never assign `undefined` to optional props, just omit
- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`, always null-check

### Auth flow
`POST /auth/login` → returns `{ user: AuthUser, tokens: { accessToken, refreshToken } }`
`POST /auth/refresh` → old refresh token revoked, new pair issued (single-use rotation)
If a revoked refresh token is presented → ALL user sessions immediately revoked (security)
Protect route: `router.get('/path', authenticate, requireRole('client'), handler)`

### Roles
- `client` → **Manager** — back office, posts jobs, manages teams
- `contractor` → **Worker** — on-site, applies to jobs, receives tasks
- `admin` → reserved, not yet used in UI

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
-- trigger: fn_touch_job_on_application — updates jobs.updated_at on new application
```

Run migrations: `pnpm --filter @constractor/api run db:migrate`
The runner is idempotent — safe to re-run (all DDL uses `IF NOT EXISTS`).

---

## 7. All API Endpoints

All routes except `/health` require `Authorization: Bearer <token>`.

```
GET  /health                                   → { status, version, timestamp }

POST /auth/register                            → { user, tokens }  (body: email, password, displayName, role)
POST /auth/login                               → { user, tokens }  (body: email, password)
POST /auth/refresh                             → { tokens }        (body: refreshToken)
POST /auth/logout                              → 204               (body: refreshToken)
GET  /auth/me                                  → { user }
GET  /auth/users                               → { users: ContactUser[] }  (all users except self, sorted by name)

GET  /jobs                                     → { jobs: JobSummary[] }    (open jobs only)
POST /jobs                                     → { job: JobDetail }        (client only)
GET  /jobs/:id                                 → { job: JobDetail }        (contractor sees only own application)
PATCH /jobs/:id                                → { job: JobDetail }        (client only; status: 'completed'|'cancelled')
POST /jobs/:id/apply                           → { application }           (contractor only; 409 if duplicate)
POST /jobs/:id/hire/:applicantId               → { job: JobDetail }        (client only; creates conversation automatically)

GET  /my/jobs                                  → { jobs: JobSummary[] }    (client: own jobs)
GET  /my/applications                          → { applications[] }        (contractor: own applications + job info)

GET  /messaging/conversations                  → { conversations: ConversationSummary[] }
POST /messaging/conversations                  → { conversation }          (body: participantId; finds or creates)
GET  /messaging/conversations/:id/messages     → { messages[] }            (query: ?after=<messageId> for polling)
POST /messaging/conversations/:id/messages     → { message }               (body: body)
POST /messaging/conversations/:id/read         → 204
```

**Business rules:**
- Hiring a contractor (`POST /jobs/:id/hire/:applicantId`): accepts that application, rejects all others, marks job as 'assigned', creates a conversation between client and contractor — all in one DB transaction.
- Contractors only see their own application on `GET /jobs/:id`.
- `GET /auth/users` returns `{ id, displayName, role }` only — no email or password hash.

---

## 8. Shared Types Package

`packages/types/src/` structure:
```
providers/        IAuthProvider, IAIProvider, IStorageProvider, IQueueProvider, IRealtimeProvider
domain/           User, Job, JobApplication, Message, Conversation, ConversationParticipant
api/
  auth.dto.ts     RegisterRequestDTO, LoginRequestDTO, AuthResponseDTO, MeResponseDTO,
                  ContactUser, ListUsersResponse
  jobs.dto.ts     JobSummary, JobDetail, JobApplicationDetail, CreateJobRequest,
                  ListJobsResponse, GetJobResponse, CreateJobResponse, ApplyToJobResponse,
                  HireContractorResponse, MyJobsResponse, MyApplicationsResponse
  messaging.dto.ts ConversationSummary, Message, StartConversationRequest,
                   StartConversationResponse, SendMessageRequest, SendMessageResponse,
                   ListMessagesResponse, ListConversationsResponse
```

After editing types, always rebuild: `pnpm --filter @constractor/types build`

---

## 9. Web App (Next.js) — Current State

### Routes
```
/                         → redirects to /login
/(auth)/login             → Sign In page  ✅ comic style
/(auth)/register          → Sign Up page  ✅ comic style, visual role picker
/(dashboard)/dashboard    → Messaging hub (Chats + People tabs)  ✅
/(dashboard)/jobs         → Job board  (plain style — not yet redesigned)
/(dashboard)/jobs/new     → Post a job (client only, plain style)
/(dashboard)/jobs/[id]    → Job detail + apply/hire (plain style)
/(dashboard)/my-jobs      → My jobs / My applications (plain style)
```

### Design system — `apps/web/src/app/globals.css`
CSS classes (use these in all new/updated pages):
- `.auth-bg` — full-screen orange→yellow gradient + halftone dot overlay
- `.auth-card` / `.auth-card-header` / `.auth-card-body` — comic card with thick border + shadow
- `.auth-tabs` / `.auth-tab` / `.auth-tab.active` — pill tab switcher
- `.comic-input` — thick-border input with orange focus glow
- `.comic-select` — same, for selects
- `.comic-btn-primary` — orange pill button with 3D shadow
- `.comic-btn-secondary` — white pill button
- `.role-card` / `.role-card.selected` — visual role picker cards
- `.field-label` — UPPERCASE bold label above inputs
- `.error-banner` — red error box
- `.spinner` — CSS animation spinner for loading states

### Color tokens (defined in globals.css :root)
- `--orange: #FF6B2B` (primary CTA)
- `--yellow: #FFD93D` (accent)
- `--navy: #1C1C2E` (text, borders, shadows)
- `--cream: #FFFBF2` (input background)
- `--radius-pill: 999px`, `--border: 2.5px solid var(--navy)`
- `--shadow-md: 5px 5px 0 var(--navy)` (standard comic shadow)

### Session storage (web)
- `sessionStorage`: `access_token` (cleared when tab closes — intentional for security)
- `localStorage`: `refresh_token`, `auth_user`
- Token refresh NOT yet implemented on web — if access token expires (15min) user must re-login

---

## 10. Mobile App (Expo) — Current State

### Screens
```
src/app/
  index.tsx              Home screen — Login / Register buttons
  _layout.tsx            Root Stack navigator
  (auth)/
    login.tsx            Login screen (plain RN style — not yet redesigned)
    register.tsx         ⚠️ MISSING — referenced in _layout but file doesn't exist
  (jobs)/
    _layout.tsx          Jobs stack
    index.tsx            Job board list (pull-to-refresh, role-aware)
    [id].tsx             Job detail + apply / hire
  (messages)/
    _layout.tsx          Messages stack
    index.tsx            ⚠️ Still has "paste user ID" UX — needs People tab like web
    [id].tsx             (to be checked/created)
```

### Token storage (mobile)
Uses `expo-secure-store` (encrypted on-device). All methods are async.
`apps/mobile/src/lib/auth/token-storage.ts`: `saveSession`, `getAccessToken`, `getRefreshToken`, `getStoredUser`, `clearSession`

### API client (mobile)
`apps/mobile/src/lib/api-client.ts` — reads `EXPO_PUBLIC_API_URL` env var.
Same structure as web: `ApiRequestError` class, `apiRequest<T>()` function.

### Path alias
`@/*` → `./src/*` (configured in tsconfig.json)

### Known issues / TODO on mobile
1. `(auth)/register.tsx` screen is missing — _layout.tsx references it but file doesn't exist
2. Messages `index.tsx` still uses "paste user ID" — needs `GET /auth/users` contacts list (same fix as web)
3. No comic design applied yet — all screens are plain React Native StyleSheet
4. Navigation after login uses `router.replace('/dashboard' as never)` — `/dashboard` route doesn't exist on mobile, this is broken

---

## 11. Planned Phases

### Phase 3 — In Progress / Next Up
**A. Mobile redesign** (comic style)
- Apply orange/yellow/navy palette to all mobile screens
- Large touch targets, round corners, bold typography
- Rewrite messages `index.tsx` with contacts list (People tab) — call `GET /auth/users`
- Create missing `(auth)/register.tsx` screen
- Fix navigation: after login go to `/(jobs)` or a proper home tab, not `/dashboard`

**B. Tasks module** (new feature — both apps)
Core concept: a Job can have multiple Tasks. A Task is assigned to a specific contractor/worker. Workers see their tasks on mobile, managers see all tasks for a job on web.

DB schema to add (migration 004):
```sql
tasks (
  id UUID PK,
  job_id UUID FK jobs(id),
  assigned_to UUID FK users(id),   -- contractor
  created_by UUID FK users(id),    -- client/manager
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
GET  /jobs/:id/tasks              → { tasks[] }      (participants only)
POST /jobs/:id/tasks              → { task }         (client only)
PATCH /tasks/:id                  → { task }         (assigned worker can update status; client can update all fields)
DELETE /tasks/:id                 → 204              (client only)
```

Mobile UX: worker opens app → sees "My Tasks" as the main screen with status cards.
Web UX: manager opens job detail → sees task list with drag-to-reorder or status columns.

### Phase 4 — Future
- Real-time messaging (replace 3-second polling with WebSocket via `SocketIOProvider`)
- Push notifications for new messages and task assignments (Expo Notifications)
- Multi-language UI support (i18n — workers may speak Arabic, Russian, etc.)
- Admin panel (role: 'admin') — user management, all jobs overview
- File attachments on tasks/messages (photos from site) — swap to S3StorageProvider

---

## 12. Outstanding Bugs / Known Issues

1. **Web: access token expiry** — no refresh logic on web. After 15 min, API calls silently fail with 401. User sees "Invalid token" error with no auto-refresh. Fix: implement token refresh in `api-client.ts` using `POST /auth/refresh`.

2. **Mobile: `/dashboard` route doesn't exist** — login redirects to `/dashboard` which crashes on mobile. Fix: change to `/(jobs)` or create a proper tab layout.

3. **Mobile: missing register screen** — `(auth)/register.tsx` file doesn't exist. Tapping Register button navigates to a 404 screen.

4. **Mobile: messages "paste user ID"** — `(messages)/index.tsx` still requires manual UUID input. Fix: call `GET /auth/users` and show a contacts list.

5. **Web: dashboard only pages not redesigned** — `/jobs`, `/jobs/new`, `/jobs/[id]`, `/my-jobs` still use plain inline styles, not the comic design system. Should be updated in Phase 3.

---

## 13. File Locations Cheat Sheet

| What | Where |
|---|---|
| API entry | `apps/api/src/main.ts` |
| Route registration | `apps/api/src/app.ts` |
| DI container | `apps/api/src/container.ts` |
| DB migrations | `apps/api/src/database/migrations/00x_*.sql` |
| Shared types | `packages/types/src/` |
| Web globals.css | `apps/web/src/app/globals.css` |
| Web session utils | `apps/web/src/lib/auth/session.ts` |
| Web API client | `apps/web/src/lib/api-client.ts` |
| Mobile token storage | `apps/mobile/src/lib/auth/token-storage.ts` |
| Mobile API client | `apps/mobile/src/lib/api-client.ts` |
| Mobile env | `apps/mobile/.env` |
| API env | `apps/api/.env` |
