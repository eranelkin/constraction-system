# Constractor System

A cross-platform contractor management and communication platform — web, mobile, and API — built as a production-grade monorepo.

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| API | Node.js 22 · Express · TypeScript (ESM) |
| Web | Next.js 15 (App Router) · React 19 |
| Mobile | Expo 52 · React Native · Expo Router |
| Database | PostgreSQL 16 (Docker) |
| Cache / Queue | Redis 7 (Docker) |
| Auth | JWT access tokens + rotating refresh tokens |
| Language | TypeScript throughout (strict mode) |

---

## Prerequisites

**Required for all services:**

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| pnpm | ≥ 9 | `npm install -g pnpm` |
| Docker Desktop | latest | [docker.com](https://www.docker.com/products/docker-desktop/) |

**Required for mobile (pick one):**

| Option | Tool | Notes |
|---|---|---|
| Physical device | [Expo Go](https://expo.dev/go) app on your phone | Easiest — no extra installs on your laptop |
| iOS Simulator | Xcode (Mac App Store) | Mac only |
| Android Emulator | [Android Studio](https://developer.android.com/studio) | Windows / Mac / Linux |

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> constractor-system
cd constractor-system
pnpm install

# 2. Start the database and Redis
docker compose up -d

# 3. Configure the API environment
cp .env.example apps/api/.env

# 4. Build shared packages (types + config)
pnpm --filter @constractor/types build
pnpm --filter @constractor/config build

# 5. Run database migrations
pnpm --filter @constractor/api run db:migrate

# 6. Start all services in development mode
pnpm dev
```

After this, three services are running:

| Service | URL | Notes |
|---|---|---|
| API | http://localhost:4000 | REST API + health check |
| Web | http://localhost:3000 | Open in any browser |
| Mobile (Expo) | http://localhost:8081 | Scan QR in terminal with Expo Go, or press `i` for iOS / `a` for Android |

---

## Installation — Step by Step

### 1. Install dependencies

```bash
pnpm install
```

This installs packages for all workspaces simultaneously. `node_modules` are managed per-package with pnpm's strict hoisting.

### 2. Start infrastructure

```bash
docker compose up -d
```

Starts two containers:

| Container | Port | Credentials |
|---|---|---|
| `constractor_postgres` | 5432 | user: `constractor` / pass: `constractor` / db: `constractor_dev` |
| `constractor_redis` | 6379 | no auth |

Check they are healthy:

```bash
docker compose ps
```

Both should show `running (healthy)`.

### 3. Configure environment

```bash
cp .env.example apps/api/.env
```

The default values in `.env.example` work out of the box for local development — no edits required. See [Environment Variables](#environment-variables) for the full reference.

### 4. Build shared packages

The `@constractor/types` and `@constractor/config` packages must be compiled before the apps can import them:

```bash
pnpm --filter @constractor/types build
pnpm --filter @constractor/config build
```

### 5. Run database migrations

```bash
pnpm --filter @constractor/api run db:migrate
```

Creates all tables: `users`, `refresh_tokens`, conversations/messages, and jobs/applications.

---

## Running the Full App

### Start everything at once

```bash
pnpm dev
```

Turborepo starts all three services in parallel with hot-reload:

| Service | URL / Access |
|---|---|
| API | http://localhost:4000 |
| Web | http://localhost:3000 |
| Mobile | Expo Dev Tools at http://localhost:8081 |

### Or start services individually

```bash
pnpm --filter @constractor/api dev       # API on :4000
pnpm --filter @constractor/web dev       # Web on :3000
pnpm --filter @constractor/mobile start  # Expo Dev Server
```

### Verify the API is running

```bash
curl http://localhost:4000/health
# → { "status": "ok", "version": "0.0.1", "timestamp": "..." }
```

---

## Running the Web UI

```bash
pnpm --filter @constractor/web dev
```

Open **http://localhost:3000** in your browser.

**Available screens:**

| Path | Screen | Who |
|---|---|---|
| `/` | Home — links to Login and Register | Public |
| `/login` | Login form | Public |
| `/register` | Register form (name, email, password, role) | Public |
| `/dashboard` | Messaging — conversation list + real-time chat | All users |
| `/jobs` | Job board — browse open jobs | All users |
| `/jobs/new` | Post a new job | Clients only |
| `/jobs/[id]` | Job detail — apply (contractor) or view/hire applicants (client) | All users |
| `/my-jobs` | My posted jobs (client) or my applications with status (contractor) | All users |

The web app talks to the API at `http://localhost:4000` by default (controlled by `NEXT_PUBLIC_API_URL` in `apps/api/.env`, which is already set correctly). No additional config is needed for local development.

---

## Running the Mobile UI

The mobile app runs via **Expo**. You have three options depending on your setup.

### Prerequisites

Install the Expo CLI globally if you haven't already:

```bash
npm install -g expo-cli
```

### Option A — iOS Simulator (Mac only)

Requires **Xcode** installed from the Mac App Store.

```bash
pnpm --filter @constractor/mobile ios
```

Expo will build and launch the app directly in the iOS Simulator. No phone needed.

### Option B — Android Emulator

Requires **Android Studio** with at least one Android Virtual Device (AVD) configured.

```bash
pnpm --filter @constractor/mobile android
```

The app launches in the running Android emulator automatically.

### Option C — Physical device (iPhone or Android)

**Step 1.** Install **Expo Go** on your phone:
- iOS: [App Store — Expo Go](https://apps.apple.com/app/expo-go/id982107779)
- Android: [Play Store — Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)

**Step 2.** Your phone and your computer must be on the **same Wi-Fi network**.

**Step 3.** Find your machine's local IP address:

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'

# Windows (PowerShell)
(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Wi-Fi).IPAddress
```

**Step 4.** Create a `.env` file for the mobile app with your local IP:

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Edit apps/mobile/.env — replace localhost with your IP, e.g.:
# EXPO_PUBLIC_API_URL=http://192.168.1.42:4000
```

> **Why?** A physical device cannot reach `localhost` on your laptop. Using the LAN IP lets both the phone and the simulator talk to the same API.

**Step 5.** Start the Expo dev server:

```bash
pnpm --filter @constractor/mobile start
```

**Step 6.** Scan the QR code:
- **iOS** — open the Camera app and point it at the QR code in the terminal
- **Android** — open Expo Go and tap **Scan QR code**

The app will load on your device within a few seconds.

### Mobile screens

| Screen | How to reach |
|---|---|
| Home | App launch — shows Login and Register buttons |
| Login | Tap **Login** — enter email and password |
| Register | Tap **Register** — enter name, email, password, role |
| Conversations | `/(messages)` — list of conversations with pull-to-refresh |
| Chat | `/(messages)/[id]` — real-time message thread (3 s polling) |
| Job Board | `/(jobs)` — browse open jobs with pull-to-refresh |
| Job Detail | `/(jobs)/[id]` — apply (contractor) or hire applicants (client) |

### Troubleshooting mobile

| Problem | Fix |
|---|---|
| "Network request failed" on device | `EXPO_PUBLIC_API_URL` still says `localhost` — replace with your machine's LAN IP |
| QR code not loading | Make sure your phone and laptop are on the same Wi-Fi network |
| iOS Simulator not found | Open Xcode → Settings → Platforms → install iOS Simulator |
| Android emulator not found | Open Android Studio → Device Manager → start a virtual device |
| Metro bundler port conflict | Another process on port 8081; run `lsof -ti:8081 | xargs kill` then retry |

---

## Building for Production

```bash
# Build everything
pnpm build

# Build a single app
pnpm --filter @constractor/api build
pnpm --filter @constractor/web build

# Start the compiled API
pnpm --filter @constractor/api start
```

---

## API Reference

Base URL: `http://localhost:4000`

### Auth

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| `POST` | `/auth/register` | — | `{ email, password, displayName, role }` | Create account · roles: `contractor`, `client` |
| `POST` | `/auth/login` | — | `{ email, password }` | Sign in |
| `GET` | `/auth/me` | Bearer | — | Get current user |
| `POST` | `/auth/refresh` | — | `{ refreshToken }` | Issue new token pair (single-use rotation) |
| `POST` | `/auth/logout` | — | `{ refreshToken }` | Revoke refresh token |
| `GET` | `/health` | — | — | Health check |

**Token usage:**
```
Authorization: Bearer <accessToken>
```

Access tokens expire in 15 minutes. Refresh tokens expire in 30 days and are invalidated after each use — the response always contains a new refresh token.

### Messaging

All routes require `Authorization: Bearer <accessToken>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/messaging/conversations` | List conversations for the current user |
| `POST` | `/messaging/conversations` | `{ participantId }` — start or resume a conversation |
| `GET` | `/messaging/conversations/:id/messages` | List messages; optional `?after=<messageId>` cursor |
| `POST` | `/messaging/conversations/:id/messages` | `{ body }` — send a message |
| `POST` | `/messaging/conversations/:id/read` | Mark conversation as read |

### Jobs

All routes require `Authorization: Bearer <accessToken>`.

| Method | Path | Role | Body | Description |
|---|---|---|---|---|
| `POST` | `/jobs` | client | `{ title, description, budget, location }` | Post a new job |
| `GET` | `/jobs` | any | — | List all open jobs |
| `GET` | `/jobs/:id` | any | — | Job detail; contractors see only their own application |
| `PATCH` | `/jobs/:id` | client (owner) | `{ status: 'completed' \| 'cancelled' }` | Update job status |
| `POST` | `/jobs/:id/apply` | contractor | `{ coverNote }` | Apply to a job |
| `POST` | `/jobs/:id/hire/:applicationId` | client (owner) | — | Hire an applicant; auto-creates a conversation |
| `GET` | `/my/jobs` | client | — | List jobs posted by the current client |
| `GET` | `/my/applications` | contractor | — | List the current contractor's applications |

**Status transitions:**
- `open` → `assigned` (via hire)
- `assigned` → `completed` (via PATCH)
- `open` → `cancelled` (via PATCH)

---

## Environment Variables

All variables live in `apps/api/.env` (copied from `.env.example`). The `@constractor/config` package validates them at startup with Zod and exits with a descriptive error if any are missing or malformed.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | API listen port |
| `DATABASE_URL` | `postgresql://constractor:constractor@localhost:5432/constractor_dev` | PostgreSQL connection string |
| `ACCESS_TOKEN_SECRET` | _(dev value)_ | JWT signing secret — **change in production** |
| `REFRESH_TOKEN_SECRET` | _(dev value)_ | Refresh token signing secret — **change in production** |
| `ACCESS_TOKEN_EXPIRES_IN` | `900` | Access token TTL in seconds (15 min) |
| `REFRESH_TOKEN_EXPIRES_IN` | `2592000` | Refresh token TTL in seconds (30 days) |
| `USE_REAL_AI` | `false` | `true` → OpenAI, `false` → mock responses |
| `USE_REAL_STORAGE` | `false` | `true` → S3, `false` → local disk (`UPLOAD_DIR`) |
| `USE_REAL_QUEUE` | `false` | `true` → BullMQ + Redis, `false` → in-memory |
| `USE_REAL_REALTIME` | `false` | `true` → Socket.IO, `false` → in-memory |
| `OPENAI_API_KEY` | _(empty)_ | Required when `USE_REAL_AI=true` |
| `AWS_*` / `S3_BUCKET` | _(empty)_ | Required when `USE_REAL_STORAGE=true` |
| `UPLOAD_DIR` | `./uploads` | Local file storage path (when `USE_REAL_STORAGE=false`) |
| `REDIS_URL` | `redis://localhost:6379` | Required when `USE_REAL_QUEUE=true` |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:19006` | Comma-separated allowed origins |

---

## Project Structure

```
constractor-system/
├── docker-compose.yml          # PostgreSQL + Redis for local dev
├── turbo.json                  # Turborepo pipeline (build → lint → test)
├── pnpm-workspace.yaml         # Workspace roots: apps/*, packages/*
├── tsconfig.base.json          # Shared TypeScript config (strict, NodeNext, ESM)
├── .env.example                # All environment variables with defaults
│
├── packages/
│   ├── types/                  # @constractor/types
│   │   └── src/
│   │       ├── providers/      # The 5 provider interfaces (contracts)
│   │       │   ├── IAuthProvider.ts
│   │       │   ├── IAIProvider.ts
│   │       │   ├── IStorageProvider.ts
│   │       │   ├── IQueueProvider.ts
│   │       │   └── IRealtimeProvider.ts
│   │       ├── domain/
│   │       │   ├── User.ts     # User entity + roles
│   │       │   ├── Message.ts  # Conversation + Message entities
│   │       │   └── Job.ts      # Job + JobApplication entities, status enums
│   │       └── api/
│   │           ├── auth.dto.ts      # Auth request/response shapes
│   │           ├── messaging.dto.ts # Messaging request/response shapes
│   │           └── jobs.dto.ts      # Jobs request/response shapes
│   │
│   └── config/                 # @constractor/config
│       └── src/
│           └── env.ts          # Zod schema → typed config object (exits on invalid env)
│
├── apps/
│   ├── api/                    # @constractor/api — Express REST API
│   │   └── src/
│   │       ├── main.ts         # Entry: buildContainer() → createApp() → listen()
│   │       ├── app.ts          # Express factory — registers routes + error handler
│   │       ├── container.ts    # DI wiring — reads ENV flags, picks concrete providers
│   │       ├── database/
│   │       │   ├── DatabaseProvider.ts         # IDatabase interface
│   │       │   ├── adapters/
│   │       │   │   └── PostgreSQLAdapter.ts    # pg pool — implements IDatabase
│   │       │   ├── migrations/
│   │       │   │   ├── 001_initial.sql         # users + refresh_tokens
│   │       │   │   ├── 002_messages.sql        # conversations + messages + trigger
│   │       │   │   └── 003_jobs.sql            # jobs + job_applications + trigger
│   │       │   ├── migrate.ts                  # Runs all *.sql files in order
│   │       │   └── repositories/
│   │       │       ├── IUserRepository.ts / UserRepository.ts
│   │       │       ├── IConversationRepository.ts / ConversationRepository.ts
│   │       │       ├── IMessageRepository.ts / MessageRepository.ts
│   │       │       ├── IJobRepository.ts / JobRepository.ts
│   │       │       └── IJobApplicationRepository.ts / JobApplicationRepository.ts
│   │       ├── providers/                      # Concrete provider implementations
│   │       │   ├── auth/JWTAuthProvider.ts     # bcrypt + JWT + refresh token rotation
│   │       │   ├── ai/MockAIProvider.ts
│   │       │   ├── storage/LocalStorageProvider.ts
│   │       │   ├── queue/InMemoryQueueProvider.ts
│   │       │   └── realtime/InMemoryRealtimeProvider.ts
│   │       ├── modules/                        # Domain feature slices
│   │       │   ├── auth/
│   │       │   │   ├── auth.schema.ts
│   │       │   │   ├── auth.middleware.ts       # createAuthMiddleware + requireRole
│   │       │   │   └── auth.router.ts
│   │       │   ├── messaging/
│   │       │   │   ├── messaging.schema.ts
│   │       │   │   └── messaging.router.ts
│   │       │   └── jobs/
│   │       │       ├── jobs.schema.ts
│   │       │       ├── jobs.router.ts          # /jobs — CRUD + apply + hire
│   │       │       └── my.router.ts            # /my/jobs + /my/applications
│   │       ├── shared/
│   │       │   ├── errors.ts                   # AppError, NotFoundError, etc.
│   │       │   └── middleware/errorHandler.ts
│   │       └── test/
│   │           ├── setup.ts                    # DB migrations + per-test TRUNCATE
│   │           ├── auth.test.ts
│   │           ├── messaging.test.ts
│   │           └── jobs.test.ts
│   │
│   ├── web/                    # @constractor/web — Next.js 15 (App Router)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx                    # Home
│   │       │   ├── (auth)/
│   │       │   │   ├── login/page.tsx
│   │       │   │   └── register/page.tsx
│   │       │   └── (dashboard)/
│   │       │       ├── dashboard/page.tsx      # Messaging UI
│   │       │       ├── jobs/page.tsx           # Job board
│   │       │       ├── jobs/new/page.tsx       # Post a job (client)
│   │       │       ├── jobs/[id]/page.tsx      # Job detail — apply / hire
│   │       │       └── my-jobs/page.tsx        # My posted jobs / applications
│   │       └── lib/
│   │           ├── api-client.ts               # Typed fetch wrapper
│   │           └── auth/session.ts             # sessionStorage + localStorage
│   │
│   └── mobile/                 # @constractor/mobile — Expo 52 (Expo Router)
│       └── src/
│           ├── app/
│           │   ├── _layout.tsx                 # Root stack navigator
│           │   ├── index.tsx                   # Home screen
│           │   ├── (auth)/
│           │   │   ├── login.tsx
│           │   │   └── register.tsx
│           │   ├── (messages)/
│           │   │   ├── _layout.tsx
│           │   │   ├── index.tsx               # Conversation list
│           │   │   └── [id].tsx                # Chat thread (3 s polling)
│           │   └── (jobs)/
│           │       ├── _layout.tsx
│           │       ├── index.tsx               # Job board
│           │       └── [id].tsx                # Job detail — apply / hire
│           └── lib/
│               ├── api-client.ts
│               └── auth/token-storage.ts       # expo-secure-store wrapper
```

---

## Architecture

### Provider abstraction

All external dependencies are hidden behind typed interfaces defined in `@constractor/types`. The concrete implementation is selected at startup in `container.ts` based on ENV flags. Business logic only ever sees the interface — swapping a provider never requires changes to modules or routes.

```
packages/types/src/providers/   ← interfaces (contracts)
apps/api/src/providers/         ← concrete implementations
apps/api/src/container.ts       ← wiring: picks mock or real based on ENV
```

| Interface | Dev (default) | Production (future) |
|---|---|---|
| `IAuthProvider` | `JWTAuthProvider` | same — JWT is production-ready |
| `IAIProvider` | `MockAIProvider` | `OpenAIProvider` |
| `IStorageProvider` | `LocalStorageProvider` | `S3StorageProvider` |
| `IQueueProvider` | `InMemoryQueueProvider` | `BullMQProvider` |
| `IRealtimeProvider` | `InMemoryRealtimeProvider` | `SocketIOProvider` |

### Dependency injection

No framework. `buildContainer()` constructs every dependency in the correct order and returns a plain `AppContainer` object. Routers are created via factory functions that receive the container:

```
main.ts
  └── buildContainer()          # instantiates db, repos, providers
        └── createApp(container)
              └── createAuthRouter(container)
```

### Database

Raw SQL through `IDatabase` — no ORM. `PostgreSQLAdapter` wraps a `pg.Pool`. Repositories accept `IDatabase` in their constructor; they are completely unaware of the underlying adapter. All queries use positional parameters (`$1`, `$2`, …).

Transactions use `db.transaction(async (tx) => { ... })` — pass `tx` as the `IDatabase` to all repositories inside the callback. Nested `transaction()` calls participate in the outer transaction (safe to call from repository methods). This pattern is used by the hire endpoint to atomically accept an application, update job status, and create a conversation in one commit.

### Auth

1. `POST /auth/register` or `POST /auth/login` → returns `{ accessToken, refreshToken }`
2. Access token: JWT, 15-minute TTL, verified in-memory (no DB lookup)
3. Refresh token: random UUID, stored as SHA-256 hash in `refresh_tokens` table, 30-day TTL
4. Every `POST /auth/refresh` revokes the old token and issues a new pair (single-use rotation)
5. If a revoked token is reused, all sessions for that user are immediately invalidated

### Module boundaries

`apps/web` and `apps/mobile` import only from `@constractor/types` and `@constractor/config`. They never import from `apps/api`. All client↔server communication is over HTTP.

---

## Development Workflow

### Type checking

```bash
pnpm type-check                              # all packages
pnpm --filter @constractor/api type-check   # single package
```

### Formatting

```bash
pnpm format
```

### Adding a new API module

1. Add domain types to `packages/types/src/domain/` and DTOs to `packages/types/src/api/`, then export from `packages/types/src/index.ts`
2. Create a migration file in `apps/api/src/database/migrations/` (use `IF NOT EXISTS`) and run `pnpm --filter @constractor/api run db:migrate`
3. Create `I<Name>Repository.ts` + `<Name>Repository.ts` in `apps/api/src/database/repositories/`
4. Create `apps/api/src/modules/<name>/` with `<name>.schema.ts` and `<name>.router.ts`
5. Add the repository to `AppContainer` in `container.ts` and wire it in `buildContainer()`
6. Register the router in `app.ts`

### Switching to real providers

Set the relevant flag in `apps/api/.env`:

```bash
USE_REAL_AI=true        # requires OPENAI_API_KEY
USE_REAL_STORAGE=true   # requires AWS_* + S3_BUCKET
USE_REAL_QUEUE=true     # requires REDIS_URL
USE_REAL_REALTIME=true  # requires Socket.IO setup
```

---

## Infrastructure Commands

```bash
docker compose up -d      # start PostgreSQL + Redis
docker compose down       # stop containers (data volumes preserved)
docker compose down -v    # stop containers AND delete all data
docker compose ps         # check container health
docker compose logs -f    # tail container logs
```
