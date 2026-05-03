# Constractor — Session Context

> **Purpose:** Cross-machine continuity. Read this before starting any new session.
> Update this file on demand: ask Claude to "update Session.md" after significant work.
> Last updated: 2026-05-03

---

## 1. Project Vision

Multi-team construction site management platform.
- **Mobile-first** — on-site workers use phones, often multilingual
- **Desktop/back-office** — managers and admins use the web app to manage teams, groups, tasks
- **Two primary modules:** Messages and Tasks
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

**Critical React version note:** `react` must stay at exactly `19.1.0` for mobile. React Native 0.81.x ships `react-native-renderer@19.1.0` internally — any mismatch crashes with "Incompatible React versions".

---

## 4. How to Run (Every Machine)

### Prerequisites
- Docker Desktop running
- pnpm installed globally (`npm i -g pnpm`)
- Node 22.x

### First-time setup
```bash
git clone <repo>
cd constraction-system
docker compose up -d                               # start Postgres + Redis
cp .env.example apps/api/.env                      # copy env template
pnpm install
pnpm --filter @constractor/types build
pnpm --filter @constractor/config build
pnpm --filter @constractor/api run db:migrate      # runs all 8 migrations
```

### Daily start
```bash
docker compose up -d
pnpm dev                                           # runs API + web (turbo)
pnpm --filter @constractor/mobile start           # Expo — scan QR with Expo Go
```

### Mobile physical device
- Phone and Mac must be on the same Wi-Fi
- Set `EXPO_PUBLIC_API_URL=http://<your-mac-ip>:4501` in `apps/mobile/.env`
- Check your Mac IP: `ipconfig getifaddr en0`

### Important: API dev script
`node --env-file=.env --import tsx/esm --watch src/main.ts` in `apps/api/package.json`.
Do NOT change to `tsx watch` — that doesn't load `.env` and config validator will reject startup.

### Moving DB data between machines
```bash
# Source machine — dump:
docker exec constraction-system-db-1 pg_dump -U postgres constractor > backup.sql

# Target machine — restore:
docker cp backup.sql constraction-system-db-1:/backup.sql
docker exec -i constraction-system-db-1 psql -U postgres -d constractor -f /backup.sql
```
Note: PostgreSQL 16 pg_dump output contains `\restrict` tokens — this is a legitimate security feature, not file corruption.

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
| `IRealtimeProvider` | `InMemoryRealtimeProvider` | `SocketIOProvider` ✅ |
| `ISpeechProvider` | `MockSpeechProvider` / `GroqSpeechProvider` | `GroqSpeechProvider` |
| `ITranslationProvider` | `MockTranslationProvider` / `GroqTranslationProvider` | `GroqTranslationProvider` |

**Important:** `USE_REAL_REALTIME=true` is required in `apps/api/.env` for socket messages to reach mobile clients. The default `InMemoryRealtimeProvider` only fires server-side callbacks — it does not send anything over the network.

ENV flags (all `false` = zero cost dev): `USE_REAL_AI`, `USE_REAL_STORAGE`, `USE_REAL_QUEUE`, `USE_REAL_REALTIME`, `USE_REAL_SPEECH`, `USE_REAL_TRANSLATION`

### Dependency injection
`apps/api/src/container.ts` is the single wiring point. All routers receive the full `AppContainer`.
Pattern: `export function createXxxRouter(container: AppContainer): Router { ... }`

### Database
Raw SQL only — no ORM. `IDatabase` interface → `PostgreSQLAdapter`.
Repositories get `IDatabase` via constructor. Transactions: `db.transaction(async (tx) => { ... })`.
All params positional: `$1, $2, ...` (PostgreSQL syntax).

### TypeScript constraints (apps/api)
- `"module": "NodeNext"` — all local imports MUST use `.js` extension
- `exactOptionalPropertyTypes: true` — never assign `undefined` to optional props, just omit. Build `updateData: DTO = {}` with conditional `if (x !== undefined) updateData.x = x`
- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`, always null-check

### Auth flow
`POST /auth/login` → `{ user: AuthUser, tokens: { accessToken, refreshToken } }`
`POST /auth/refresh` → old token revoked, new pair issued (single-use rotation)
If a revoked token is presented → ALL user sessions immediately revoked
Protect route: `router.get('/path', authenticate, requireRole('admin', 'manager'), handler)`

### Roles
- `admin` — full access, web manage panel, can manage admin accounts
- `manager` — web manage panel, can manage users/groups (not admin accounts)
- `member` — mobile app only (messaging, groups, jobs)

---

## 6. Database Schema

### Migration 001 — users & auth
```sql
users (id UUID PK, email TEXT UNIQUE, password_hash, display_name, role, email_verified, created_at)
refresh_tokens (id, user_id FK, token_hash UNIQUE, expires_at, revoked_at, created_at, user_agent, ip_address)
```

### Migration 002 — messaging
```sql
conversations (id UUID PK, name TEXT, type TEXT NOT NULL DEFAULT 'direct', created_at, updated_at)
-- type: 'direct' | 'group'
-- name: used for group conversations
conversation_participants (conversation_id FK, user_id FK, last_read_at) -- composite PK
messages (id UUID PK, conversation_id FK, sender_id FK, body TEXT, created_at)
-- trigger: fn_touch_conversation — updates conversations.updated_at on new message
```
**Note:** `name` and `type` columns were added to `conversations` for group chat support.

### Migration 003 — jobs
```sql
jobs (id UUID PK, client_id FK, title, description, budget NUMERIC, location, status, assigned_contractor_id FK, created_at, updated_at)
job_applications (id UUID PK, job_id FK, contractor_id FK, cover_note, status, created_at)
```

### Migration 004 — rename roles
```sql
-- role CHECK: 'admin' | 'manager' | 'member'
```

### Migration 005 — user language & avatar
```sql
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN avatar_data BYTEA;
ALTER TABLE users ADD COLUMN avatar_mime_type TEXT;
```
**Note:** `language` is embedded in JWT. Users must re-login to get it in their token. Old tokens default to `'en'`.

### Migration 006 — groups
```sql
groups (
  id UUID PK DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  emoji TEXT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
)
CREATE INDEX group_members_user_idx ON group_members(user_id);
```
Every group auto-creates a group conversation when created via `POST /groups`. `conversation_id` is stored back on the group.

### Migration 007 — user active flag
```sql
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
```
`is_active = false` → 403 on login/token refresh. Inactive users excluded from contact list.

### Migration 008 — message translation cache
```sql
message_translations (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  language   VARCHAR(10) NOT NULL,
  translated_body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, language)
)
```
Translations are computed by Groq once and stored permanently per `(message_id, language)`.
`MessageRepository.list()` bulk-fetches cached translations for the requesting user's language and attaches `translatedBody` to each message. Zero extra Groq calls on re-entry to a chat.

Run migrations: `pnpm --filter @constractor/api run db:migrate`
The runner is idempotent — safe to re-run.

---

## 7. All API Endpoints

All routes except `/health` require `Authorization: Bearer <token>`.

```
GET  /health                                   → { status, version, timestamp }

POST /auth/register                            → { user, tokens }
POST /auth/login                               → { user, tokens }
POST /auth/refresh                             → { tokens }
POST /auth/logout                              → 204
GET  /auth/me                                  → { user }
GET  /auth/users                               → { users: ContactUser[] }  (all users except self)

GET  /users                                    → { users: PublicUser[] }   (admin/manager only)
POST /users                                    → { user }                  (admin/manager)
PATCH /users/:id                               → { user }                  (admin/manager)
DELETE /users/:id                              → 204                       (admin/manager)
GET  /users/:id/avatar                         → image bytes               (public, no auth, Cache-Control: 3600s)

POST /speech/transcribe                        → { text }                  (body: { audio: base64, mimeType })
                                                                            Uses user's JWT language for Groq Whisper

POST /translate                                → { translatedText }        (body: { text, targetLanguage?, messageId? })
                                                                            targetLanguage defaults to req.user.language from JWT
                                                                            messageId enables cache: checks DB before Groq, stores result after

GET  /messaging/conversations                  → { conversations: ConversationSummary[] }
                                                                            includes unreadCount per conversation
POST /messaging/conversations                  → { conversation }          (body: participantId; finds or creates direct)
GET  /messaging/conversations/:id/messages     → { messages[] }            (?after=<uuid> newer, ?before=<uuid> older, ?limit=1-100 default 50)
                                                                            each message includes translatedBody if cached for req.user.language
POST /messaging/conversations/:id/messages     → { message }               (body: body)
POST /messaging/conversations/:id/read         → 204                       (updates last_read_at → clears unread badge)

GET  /groups/mine                              → { groups: PublicGroup[] } (ALL auth users — returns own groups)
GET  /groups                                   → { groups: PublicGroup[] } (admin/manager only)
POST /groups                                   → { group }                 (admin/manager; auto-creates group conversation)
GET  /groups/:id                               → { group }                 (admin/manager)
PATCH /groups/:id                              → { group }                 (admin/manager)
DELETE /groups/:id                             → 204                       (admin/manager; cascades conversation)
PUT  /groups/:id/members/set                   → { group }                 (replace full member list + sync conversation_participants)
POST /groups/:id/members                       → { group }                 (add single member)
DELETE /groups/:id/members/:userId             → { group }                 (remove single member)
PUT  /groups/user/:userId/memberships          → 204                       (set all group memberships for a user atomically)

GET  /jobs ...                                 (unchanged, see jobs module)
GET  /my/jobs, GET /my/applications            (unchanged)

POST /dev/clear-messages                       → 204  (no auth; DEV only — not mounted in production)
                                                       Deletes all messages + cascades message_translations.
                                                       Does NOT delete users, groups, or conversations.
```

**CRITICAL — middleware order in `groups.router.ts`:**
`GET /groups/mine` is registered BEFORE `router.use(requireRole(...))`. All other group routes require admin/manager. If you add routes to this file, be aware of this split.

### ConversationSummary shape
```typescript
interface ConversationSummary {
  id: string;
  updatedAt: Date;
  participants: Array<{ userId: string; displayName: string; lastReadAt: Date }>;
  lastMessage: { body: string; createdAt: Date } | null;
  unreadCount: number;  // messages from others after user's last_read_at
}
```
`unreadCount` is computed via SQL subquery in `ConversationRepository.findByUserId()`.

---

## 8. Shared Types Package

`packages/types/src/` structure:
```
providers/
  IAuthProvider.ts       AuthUser (includes language: string), IAuthProvider
  ISpeechProvider.ts     transcribe(buffer, mimeType, language?): Promise<string>
  ITranslationProvider.ts translate(text, targetLanguage): Promise<string>
  IAIProvider.ts, IStorageProvider.ts, IQueueProvider.ts, IRealtimeProvider.ts
domain/
  User.ts                User, PublicUser, CreateUserDTO, UpdateUserDTO
  Message.ts             Message { id, conversationId, senderId, senderName, body, createdAt, translatedBody? }
  Job.ts                 Job, JobApplication
  Group.ts               Group, PublicGroup, GroupMember, CreateGroupDTO, UpdateGroupDTO
api/
  auth.dto.ts            ContactUser, ListUsersResponse
  users.dto.ts           ListUsersResponse, UserResponse, CreateUserRequest, UpdateUserRequest
  jobs.dto.ts            JobSummary, JobDetail, ...
  messaging.dto.ts       ConversationSummary (with unreadCount), ListMessagesResponse
  groups.dto.ts          ListGroupsResponse, GroupResponse, CreateGroupRequest, UpdateGroupRequest
```

### Key shapes
```typescript
// AuthUser — embedded in JWT
interface AuthUser { id, email, displayName, role, language: string }

// Message — translatedBody populated by list() from DB cache
interface Message { id, conversationId, senderId, senderName, body, createdAt: Date, translatedBody?: string }

// Group domain
interface Group { id, name, description: string|null, color: string|null, emoji: string|null,
                  conversationId: string|null, createdBy, createdAt, updatedAt }
interface PublicGroup extends Group { memberCount: number; members: GroupMember[] }
interface GroupMember { groupId, userId, displayName, joinedAt }
```

After editing types: `pnpm --filter @constractor/types build`
After editing config: `pnpm --filter @constractor/config build`

---

## 9. Speech & Translation

### STT (`POST /speech/transcribe`)
- Provider: Groq Whisper (`whisper-large-v3-turbo`)
- Body: `{ audio: base64, mimeType: 'audio/m4a' }`
- User's `language` from JWT is passed to Groq for better accuracy
- ENV: `USE_REAL_SPEECH=true` + `GROQ_API_KEY=<key>` in `apps/api/.env`
- Mock: returns `"[mock transcription of audio]"` instantly

### Auto-translation (`POST /translate`)
- Provider: Groq LLaMA (`llama-3.3-70b-versatile`, temperature 0.1)
- Body: `{ text, targetLanguage?, messageId? }` — `targetLanguage` defaults to `req.user.language` from JWT
- `messageId` (optional): if provided, checks `message_translations` DB cache first. On cache miss, calls Groq and stores result. Subsequent calls for same `(messageId, language)` never hit Groq.
- ENV: `USE_REAL_TRANSLATION=true` + `GROQ_API_KEY=<key>` in `apps/api/.env`
- Mock: prefixes `[EN]` (or relevant code) to original text
- Supported: en, he, ar, ru, es, fr, de, it, pt, zh, ja, ko, tr, hi

### Mobile translation strategy
**Initial load:** `GET /messages?language=<lang>` returns `translatedBody` for all messages with a cached translation — zero separate `/translate` calls.

**Socket-delivered new messages (no flicker approach):**
1. `new_message` arrives → handler checks `incoming.senderId !== userIdRef.current` and `!incoming.translatedBody`
2. Adds message ID to `translatingSet` (blocks fallback `useEffect` from racing)
3. Calls `POST /translate` with `messageId` to populate cache
4. Only AFTER translation resolves → `setMessages([...prev, translatedMsg])` — message appears already translated
5. If message was already in state from a REST race during initial load → `prev.map(m => m.id === id ? translatedMsg : m)` updates in-place
6. On translate failure → adds untranslated message, removes from `translatingSet` so fallback can retry

**Fallback `useEffect`:** Watches `[messages, userId, userLanguage]`. Catches any initial-load messages that lack `translatedBody` (e.g. DB cache miss on first visit). Uses `translatingSet` to prevent double-translating. Does NOT fire for socket messages (they either have `translatedBody` already or are blocked by `translatingSet`).

**Refs used:** `userIdRef` and `userLanguageRef` mirror the `userId`/`userLanguage` state so socket callbacks always read current values without stale closures.

---

## 10. Groups Feature

### Concept
Groups = named collections of users (name + description + color + emoji). Managed by admin/managers in web panel. Each group auto-creates a shared group conversation when created.

### Group properties
- `name` (required), `description` (optional), `color` (hex, optional), `emoji` (optional)
- `conversationId` — FK to group's shared conversation (set when group is created)
- `memberCount`, `members[]` — computed/joined in `PublicGroup`

### Web manage panel (`/manage/groups`)
- Full CRUD: create, edit, delete
- Emoji picker (15 options), color palette (10 presets)
- Members managed via checkbox list in form panel
- On group delete: conversation cascades automatically

### Bidirectional membership sync
- From group form: `PUT /groups/:id/members/set { userIds }` — replaces member list + syncs `conversation_participants`
- From user form: `PUT /groups/user/:userId/memberships { groupIds }` — sets all memberships atomically + syncs conversations
- Both endpoints keep `conversation_participants` in sync with group membership

### Mobile messaging integration
- Home screen fetches `GET /groups/mine` + `/auth/users` + `/messaging/conversations` in parallel
- Messages tab shows two sections: **💬 Direct Messages** and **🏘️ Groups**
- Tapping a group navigates to chat with `conversationId`, `isGroup=true`, `avatarEmoji`, `avatarColor`
- Group chat bubbles show sender's first initial in a colored circle (color derived from `senderId`)
- Translation still auto-applies in group chats

---

## 11. Unread Message Badges

### How it works
- `ConversationSummary.unreadCount` computed server-side: COUNT of messages created after the user's `last_read_at` that were not sent by the user
- `GET /messaging/conversations` returns `unreadCount` for every conversation
- Home screen maps conversations to contacts (by other participant `userId`) and groups (by `conversationId`) to build `contactUnread` and `groupUnread` maps
- Green badge shown when `unreadCount > 0`, capped at "99+"

### Marking read
- Chat screen `useEffect` on mount → `POST /read` immediately on open
- Chat screen `useFocusEffect` **cleanup** → `POST /read` fires exactly when user navigates away from chat

### Real-time badge updates (home screen)
- `useFocusEffect` in home screen (not a plain `useEffect`) re-registers the `conversation_updated` socket listener on every focus. This handles socket reconnections — if the socket reconnects with a new instance while away, the listener re-attaches to the fresh socket on return.
- `conversation_updated` calls `loadData(myId, true)` — the `silent=true` flag skips the loading spinner so the badge updates without a UI flash.
- Server emits `conversation_updated` to `user:{participantId}` for every participant when a new message is sent.

### Timing fix for "stale badge after leaving chat"
- `useFocusEffect` in home has a **300ms delay** before calling `loadData` (0ms on first focus via `isFirstFocusRef`)
- This window lets the chat screen's `useFocusEffect` cleanup `POST /read` complete before the home screen fetches conversation data
- `loadData` also accepts `silent?: boolean` — silent calls skip `setLoading(true)` and suppress the error Alert

---

## 12. Web Manage Panel (`/manage`)

### Routes
```
/manage/users     User management — full CRUD, language, avatar, group membership
/manage/groups    Group management — full CRUD, emoji/color, member list
/manage/tasks     Placeholder — coming soon
```

### Access control
- Redirects to `/login` if not authenticated or if `role === 'member'`
- Header: logo + nav tabs on left, user avatar + role badge + logout on right

### User form
- Fields: display name, email, password (create only), role, language (14 options), avatar upload (jpg/png/webp/gif, max 2MB)
- Group membership: colored toggle pills (one per group)
- On save: PATCH/POST user → `PUT /groups/user/:id/memberships { groupIds }`

### Group form
- Fields: name, description, emoji picker, color palette, member checkbox list
- POST /groups auto-creates group conversation; changing name syncs conversation name

---

## 13. Mobile App — Current State

### Navigation
```
(root index)  → (auth)/login  → (home)/index  ← main hub
              → (auth)/register → (home)/index
(home)/index  → (messages)/[id]   chat screen
```

### Login screen DEV panel (`__DEV__` only)
- Quick-login buttons: 👷 Hebrew (`member1@test.com`), 👷 English (`member2@test.com`), 👔 Manager 1 (`manager1@test.com`) — all password `Test1234!`
- 🗑️ **Clear All Messages** button — calls `POST /dev/clear-messages` (deletes messages + translations, keeps users/groups/conversations)

### Home screen (`(home)/index.tsx`) ✅
- Orange header "🏗️ Constractor", user avatar (loads from API), logout button (⏻ with confirmation)
- **Msg tab:** fetches `/auth/users` + `/groups/mine` + `/messaging/conversations` in parallel
  - Section: **💬 Direct Messages** — contact cards with user photo (API fallback to emoji)
  - Section: **🏘️ Groups** — group cards with emoji/color badge, name, member count, description
  - Green unread badge on cards with count, capped at 99+
- **Tasks tab:** "Coming Soon" 🚧
- **Badge refresh strategy:**
  - `useFocusEffect` (300ms delay on return from other screens, 0ms on first mount) reloads all data
  - Socket `conversation_updated` listener re-registered on every focus for real-time badge updates

### Chat screen (`(messages)/[id].tsx`) ✅
- **Params:** `id` (conversation ID), `userName`, `userId` (for direct), `avatarEmoji`, `avatarColor`, `isGroup`
- **Header:** back ‹ + avatar (user photo for direct, emoji/color badge for group) + name
- **FlatList is INVERTED** — `data={flatData} inverted`
  - `flatData` (memoized) is a `FlatItem[]` array: union of `{ type: 'message', data: Message }` and `{ type: 'separator', label: string, key: string }`
  - Separators are injected after each day-boundary in the reversed array → appear visually ABOVE each day's first message
- **Date separators:** dark semi-transparent pill (`rgba(28,28,46,0.55)`), white text. Label = `"Today"` if `createdAt` date matches today, else `"April 25, 2026"` via `toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })`
- **Message time:** shown inside each bubble, bottom-right (`alignSelf: 'flex-end'`). Format: 24h `HH:mm` (e.g. `20:32`). Orange bubbles → `rgba(255,255,255,0.65)`. White bubbles → `#AAA`.
- **Bubbles:** orange (self, right) / white (others, left) with comic borders
  - Direct: loads other user's avatar from API
  - Group: colored circle with sender's first initial (color derived from `senderId.charCodeAt(0)`)
- **Real-time via Socket.IO** (`USE_REAL_REALTIME=true` required)
  - Socket joins `conversation:{id}` room BEFORE the REST fetch (prevents race: messages sent during initial load arrive via socket and are deduped)
  - `new_message` handler translates before showing (see §9)
- **Mark as read:**
  - On mount: `POST /read` (covers all messages present on open)
  - On blur: `useFocusEffect` cleanup → `POST /read` (ensures badge clears after leaving)
  - On `new_message` socket event: `POST /read` fire-and-forget
- **Backward pagination:** `onEndReached` → `loadOlder()` fetches `?before=<oldestId>` (50 messages). Spinner at top while loading. `hasMore` flag stops when fewer than 50 returned.
- **Voice:** record (expo-av) → Groq Whisper transcribe → edit → send.
- **Input bar:** text input + send ➤ / voice 🎙️ toggle.

### Socket module (`apps/mobile/src/lib/socket.ts`)
Module-level singleton `socket`. `connectSocket(token)` returns existing if `socket.connected`, else creates new `io()`. `getSocket()` returns current instance or null. Shared between home and chat screens.

### Token storage
`apps/mobile/src/lib/auth/token-storage.ts` — `expo-secure-store` (encrypted). All methods async.

---

## 14. Pending / Next Steps

1. **Tasks module** — main next priority
   - DB migration: `tasks` table with `job_id`, `assigned_to`, `title`, `status`, `priority`, `due_date`
   - API: `GET/POST /jobs/:id/tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`
   - Web `/manage/tasks`: manager creates/assigns tasks
   - Mobile Tasks tab: worker sees their assigned tasks as status cards

2. **Push notifications** — Expo Notifications for new messages and task assignments

3. **Web: token auto-refresh** — `api-client.ts` has no refresh logic; after 15 min, API calls return 401 silently

4. **Socket reconnect on foreground** — no `AppState` listener exists; if app is backgrounded and socket disconnects, messages may be missed until the screen is re-mounted

---

## 15. Outstanding Bugs / Known Issues

1. **Web: access token expiry** — no auto-refresh. After 15 min, API calls return 401 silently.
2. **Web: jobs/dashboard pages** — `/jobs`, `/dashboard`, etc. still use plain styles, not comic design.
3. **Socket reconnect on app foreground** — no `AppState` listener. If a device is backgrounded and the socket drops, messages sent while backgrounded won't appear in real-time until the chat screen is re-mounted. Workaround: kill and reopen the app (auto-login restores session and REST fetch catches up).

---

## 16. Fixed Bugs (for reference)

- **findOrCreate returned group conversation** — `ConversationRepository.findOrCreate` lacked `WHERE c.type = 'direct'`, so opening a DM after being added to a group would return the group conversation instead. Fixed by adding the type filter.
- **Messages not appearing for receiver** — REST initial load returned oldest-first slice. Fixed: `list()` uses `ORDER BY created_at DESC LIMIT 50` wrapped in `ASC` subquery to return the most recent 50 messages.
- **Translation flicker (socket messages)** — message appeared untranslated then flickered to translated. Fixed: translate BEFORE `setMessages`, block fallback `useEffect` with `translatingSet`, use `map` instead of skip if message already in state from REST race.
- **Stale unread badge after leaving chat** — `POST /read` raced with home screen `loadData`. Fixed: `useFocusEffect` cleanup in chat fires `POST /read` on blur; home screen `useFocusEffect` waits 300ms before fetching.
- **No real-time badge on home screen** — socket `conversation_updated` listener was in `useEffect` (ran once). If socket reconnected (new instance), listener was on dead socket. Fixed: moved to `useFocusEffect` so it re-registers on every focus.
- **English users not seeing translations** — `language !== 'en'` guard prevented translation. Removed; all users can receive translations.

---

## 17. File Locations Cheat Sheet

| What | Where |
|---|---|
| API entry | `apps/api/src/main.ts` |
| Route registration | `apps/api/src/app.ts` |
| DI container | `apps/api/src/container.ts` |
| DB migrations | `apps/api/src/database/migrations/00x_*.sql` |
| Group repository | `apps/api/src/database/repositories/GroupRepository.ts` |
| Conversation repository | `apps/api/src/database/repositories/ConversationRepository.ts` |
| Message repository | `apps/api/src/database/repositories/MessageRepository.ts` |
| Translation cache repository | `apps/api/src/database/repositories/TranslationCacheRepository.ts` |
| Groups router | `apps/api/src/modules/groups/groups.router.ts` |
| Messaging router | `apps/api/src/modules/messaging/messaging.router.ts` |
| Translate router | `apps/api/src/modules/translate/translate.router.ts` |
| Dev router | `apps/api/src/modules/dev/dev.router.ts` |
| Speech provider (Groq) | `apps/api/src/providers/speech/GroqSpeechProvider.ts` |
| Translation provider (Groq) | `apps/api/src/providers/translation/GroqTranslationProvider.ts` |
| Socket.IO provider | `apps/api/src/providers/realtime/SocketIOProvider.ts` |
| Shared types | `packages/types/src/` |
| Web globals.css | `apps/web/src/app/globals.css` |
| Web manage layout | `apps/web/src/app/manage/layout.tsx` |
| Web users page | `apps/web/src/app/manage/users/page.tsx` |
| Web groups page | `apps/web/src/app/manage/groups/page.tsx` |
| Web session utils | `apps/web/src/lib/auth/session.ts` |
| Web API client | `apps/web/src/lib/api-client.ts` |
| Mobile home screen | `apps/mobile/src/app/(home)/index.tsx` |
| Mobile chat screen | `apps/mobile/src/app/(messages)/[id].tsx` |
| Mobile login screen | `apps/mobile/src/app/(auth)/login.tsx` |
| Mobile socket module | `apps/mobile/src/lib/socket.ts` |
| Mobile token storage | `apps/mobile/src/lib/auth/token-storage.ts` |
| Mobile API client | `apps/mobile/src/lib/api-client.ts` |
| Mobile env | `apps/mobile/.env` |
| API env | `apps/api/.env` |

### apps/api/.env required keys
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/constractor
JWT_SECRET=<secret>
GROQ_API_KEY=<key>           # required for real speech + translation
USE_REAL_REALTIME=true       # Socket.IO — required for mobile chat to receive messages
USE_REAL_SPEECH=true         # Groq Whisper STT
USE_REAL_TRANSLATION=true    # Groq LLaMA translation + DB cache
```
