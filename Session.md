# Constractor — Session Context

> **Purpose:** Cross-machine continuity. Read this before starting any new session.
> Update this file on demand: ask Claude to "update Session.md" after significant work.
> Last updated: 2026-05-02

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
pnpm --filter @constractor/api run db:migrate      # runs all 6 migrations
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
| `IRealtimeProvider` | `InMemoryRealtimeProvider` | `SocketIOProvider` |
| `ISpeechProvider` | `MockSpeechProvider` / `GroqSpeechProvider` | `GroqSpeechProvider` |
| `ITranslationProvider` | `MockTranslationProvider` / `GroqTranslationProvider` | `GroqTranslationProvider` |

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

POST /translate                                → { translatedText }        (body: { text, targetLanguage? })
                                                                            targetLanguage defaults to req.user.language from JWT

GET  /messaging/conversations                  → { conversations: ConversationSummary[] }
                                                                            includes unreadCount per conversation
POST /messaging/conversations                  → { conversation }          (body: participantId; finds or creates)
GET  /messaging/conversations/:id/messages     → { messages[] }            (?after=<messageId> for incremental polling)
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
  Message.ts             Message, Conversation, ConversationParticipant
  Job.ts                 Job, JobApplication
  Group.ts               Group, PublicGroup, GroupMember, CreateGroupDTO, UpdateGroupDTO
api/
  auth.dto.ts            ContactUser, ListUsersResponse
  users.dto.ts           ListUsersResponse, UserResponse, CreateUserRequest, UpdateUserRequest
  jobs.dto.ts            JobSummary, JobDetail, ...
  messaging.dto.ts       ConversationSummary (with unreadCount), Message, ...
  groups.dto.ts          ListGroupsResponse, GroupResponse, CreateGroupRequest, UpdateGroupRequest
```

### Key shapes
```typescript
// AuthUser — embedded in JWT
interface AuthUser { id, email, displayName, role, language: string }

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
- Body: `{ text, targetLanguage? }` — `targetLanguage` defaults to `req.user.language` from JWT
- ENV: `USE_REAL_TRANSLATION=true` + `GROQ_API_KEY=<key>` in `apps/api/.env`
- Mock: prefixes `[EN]` (or relevant code) to original text
- Supported: en, he, ar, ru, es, fr, de, it, pt, zh, ja, ko, tr, hi

### Mobile auto-translate (in chat screen)
- `useEffect` watches `[messages, userId, userLanguage]`
- Translates all incoming messages not from self, on arrival
- `translatingSet` ref prevents double-translating the same message ID
- Shows `ActivityIndicator` spinner in bubble while translating
- Replaces bubble text with translated result (no separate bubble)
- Silent failure — shows original text if translation fails

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
- `ConversationSummary.unreadCount` is computed server-side: COUNT of messages in the conversation created after the user's `last_read_at` AND not sent by the user themselves
- `GET /messaging/conversations` returns `unreadCount` for every conversation
- Mobile home screen cross-references conversations with contacts (by other participant `userId`) and groups (by `conversationId`) to build `contactUnread` and `groupUnread` maps
- Green badge (dark border) shown on card when `unreadCount > 0`, capped at "99+"

### Clear badge
- Chat screen calls `POST /messaging/conversations/:id/read` on mount → sets `last_read_at = NOW()`
- Home screen uses `useFocusEffect` to reload unread counts every time it comes into focus (e.g. returning from chat)

### Known timing issue fix
`useFocusEffect` fires before `getStoredUser()` resolves on first mount, so `myId` could be undefined. Fixed by: `loadData` falls back to `meRef.current?.id ?? (await getStoredUser())?.id` when `myId` is not provided.

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

### Home screen (`(home)/index.tsx`) ✅
- Orange header "🏗️ Constractor", user avatar (loads from API), logout button (⏻ with confirmation)
- **Msg tab:** fetches `/auth/users` + `/groups/mine` + `/messaging/conversations` in parallel
  - Section: **💬 Direct Messages** — contact cards with user photo (API fallback to emoji)
  - Section: **🏘️ Groups** — group cards with emoji/color badge, name, member count, description
  - Green unread badge on cards with count
  - `useFocusEffect` refreshes unread counts when returning from chat
- **Tasks tab:** "Coming Soon" 🚧

### Chat screen (`(messages)/[id].tsx`) ✅
- **Params:** `id` (conversation ID), `userName`, `userId` (for direct), `avatarEmoji`, `avatarColor`, `isGroup`
- **Header:** back ‹ + avatar (user photo for direct, emoji/color badge for group) + name
- **FlatList is INVERTED** — `data={[...messages].reverse()} inverted`
  - This is the correct React Native chat pattern: newest message always at bottom, no manual `scrollToEnd`, no flickering from content size changes or translations updating bubble heights
- **Bubbles:** orange (self, right) / white (others, left) with comic borders
  - Direct: loads other user's avatar from API
  - Group: colored circle with sender's first initial (color derived from `senderId.charCodeAt(0)`)
- **3-second polling** with `?after=<lastMessageId>` incremental fetch; deduplicates by existing IDs before appending
- **Auto-translate** all incoming messages (see §9)
- **Mark as read:** `POST /messaging/conversations/:id/read` called on mount
- **Voice:** record (expo-av) → Groq Whisper transcribe → edit → send
- **Input bar:** text input + send ➤ / voice 🎙️ toggle

### Token storage
`apps/mobile/src/lib/auth/token-storage.ts` — `expo-secure-store` (encrypted). All methods async.

---

## 14. Pending / Next Steps

1. **Tasks module** — main next priority
   - DB migration 007: `tasks` table with `job_id`, `assigned_to`, `title`, `status`, `priority`, `due_date`
   - API: `GET/POST /jobs/:id/tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`
   - Web `/manage/tasks`: manager creates/assigns tasks
   - Mobile Tasks tab: worker sees their assigned tasks as status cards

2. **Real-time messaging** — replace 3-second polling with WebSocket (`SocketIOProvider`)

3. **Push notifications** — Expo Notifications for new messages and task assignments

4. **Web: token auto-refresh** — `api-client.ts` has no refresh logic; after 15 min, user must re-login

---

## 15. Outstanding Bugs / Known Issues

1. **Web: access token expiry** — no auto-refresh. After 15 min, API calls return 401 silently.
2. **Web: jobs/dashboard pages** — `/jobs`, `/dashboard`, etc. still use plain styles, not comic design.
3. **Mobile: login screen** — plain style, not yet comic-styled.

---

## 16. File Locations Cheat Sheet

| What | Where |
|---|---|
| API entry | `apps/api/src/main.ts` |
| Route registration | `apps/api/src/app.ts` |
| DI container | `apps/api/src/container.ts` |
| DB migrations | `apps/api/src/database/migrations/00x_*.sql` |
| Group repository | `apps/api/src/database/repositories/GroupRepository.ts` |
| Conversation repository | `apps/api/src/database/repositories/ConversationRepository.ts` |
| Groups router | `apps/api/src/modules/groups/groups.router.ts` |
| Messaging router | `apps/api/src/modules/messaging/messaging.router.ts` |
| Speech provider (Groq) | `apps/api/src/providers/speech/GroqSpeechProvider.ts` |
| Translation provider (Groq) | `apps/api/src/providers/translation/GroqTranslationProvider.ts` |
| Shared types | `packages/types/src/` |
| Web globals.css | `apps/web/src/app/globals.css` |
| Web manage layout | `apps/web/src/app/manage/layout.tsx` |
| Web users page | `apps/web/src/app/manage/users/page.tsx` |
| Web groups page | `apps/web/src/app/manage/groups/page.tsx` |
| Web session utils | `apps/web/src/lib/auth/session.ts` |
| Web API client | `apps/web/src/lib/api-client.ts` |
| Mobile home screen | `apps/mobile/src/app/(home)/index.tsx` |
| Mobile chat screen | `apps/mobile/src/app/(messages)/[id].tsx` |
| Mobile token storage | `apps/mobile/src/lib/auth/token-storage.ts` |
| Mobile API client | `apps/mobile/src/lib/api-client.ts` |
| Mobile env | `apps/mobile/.env` |
| API env | `apps/api/.env` |

### apps/api/.env required keys
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/constractor
JWT_SECRET=<secret>
GROQ_API_KEY=<key>           # required for real speech + translation
USE_REAL_SPEECH=true         # Groq Whisper STT
USE_REAL_TRANSLATION=true    # Groq LLaMA translation
```
