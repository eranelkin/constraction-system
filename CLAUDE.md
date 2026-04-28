# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Prerequisites:** Docker must be running before starting the API.

```bash
# Infrastructure
docker compose up -d                              # start PostgreSQL (:5432) + Redis (:6379)
docker compose down                               # stop containers

# Install (from repo root)
pnpm install

# Run all apps in dev mode
pnpm dev

# Run a single app
pnpm --filter @constractor/api dev               # API on :4000 (tsx watch)
pnpm --filter @constractor/web dev               # Next.js on :3000
pnpm --filter @constractor/mobile start          # Expo

# Database migrations (run after docker compose up -d)
pnpm --filter @constractor/api run db:migrate

# Type checking
pnpm type-check                                  # all packages
pnpm --filter @constractor/api type-check        # single package

# Build shared packages (required before type-checking apps)
pnpm --filter @constractor/types build
pnpm --filter @constractor/config build

# Format
pnpm format
```

**First-time setup:**
```bash
docker compose up -d
cp .env.example apps/api/.env
pnpm install
pnpm --filter @constractor/types build && pnpm --filter @constractor/config build
pnpm --filter @constractor/api run db:migrate
```

## Architecture

### Monorepo layout

```
packages/
  types/     # @constractor/types  — provider interfaces + domain entities + API DTOs (no runtime deps)
  config/    # @constractor/config — Zod-validated env, typed config object (exits on bad env)
apps/
  api/       # Express + TypeScript backend
  web/       # Next.js 15 (App Router)
  mobile/    # Expo 52 (Expo Router)
```

`packages/types` is the source of truth for everything shared across the wire. `apps/web` and `apps/mobile` may only import from `packages/types` and `packages/config` — never from `apps/api`.

### Provider abstraction (the most important pattern)

Every external concern is behind a typed interface in `packages/types/src/providers/`:

| Interface | Dev implementation | Production (future) |
|---|---|---|
| `IAuthProvider` | `JWTAuthProvider` | same (JWT is prod-ready) |
| `IAIProvider` | `MockAIProvider` | `OpenAIProvider` |
| `IStorageProvider` | `LocalStorageProvider` | `S3StorageProvider` |
| `IQueueProvider` | `InMemoryQueueProvider` | `BullMQProvider` |
| `IRealtimeProvider` | `InMemoryRealtimeProvider` | `SocketIOProvider` |

All concrete implementations live in `apps/api/src/providers/`. Switching between dev and prod is done via ENV flags — the business logic never changes.

### Dependency injection (container pattern)

`apps/api/src/container.ts` is the single wiring point. It reads ENV flags and instantiates the correct concrete provider for each interface. Routers receive the `AppContainer` via factory functions:

```typescript
// Adding a new module — always use this pattern
export function createContractorsRouter(container: AppContainer): Router { ... }
```

`buildContainer()` in `main.ts` → `createApp(container)` in `app.ts` → module routers. No global singletons, no service locator.

### Database layer

Raw SQL only — no ORM. The `IDatabase` interface (`apps/api/src/database/DatabaseProvider.ts`) is implemented by `PostgreSQLAdapter`. Repositories receive `IDatabase` via constructor; they never touch the adapter directly.

- All params use positional `$1, $2...` (PostgreSQL syntax)
- Transactions: `db.transaction(async (tx) => { ... })` — pass `tx` to all queries inside
- New tables: add a migration file in `apps/api/src/database/migrations/` and run `db:migrate`

### Adding a new domain module

1. Create `apps/api/src/modules/<name>/` with `<name>.schema.ts` (Zod), `<name>.service.ts`, `<name>.router.ts`
2. Add repository interface + implementation in `apps/api/src/database/repositories/`
3. Add repository to `AppContainer` in `container.ts` and inject it into the module router
4. Register the router in `app.ts`

### TypeScript constraints

- `"module": "NodeNext"` — all local imports in `apps/api` must use `.js` extension (e.g. `'./foo.js'` resolves to `foo.ts` at dev time)
- `exactOptionalPropertyTypes: true` — omit optional properties entirely rather than assigning `undefined`; use `if (x !== undefined) obj.prop = x` patterns
- `noUncheckedIndexedAccess: true` — array/map access returns `T | undefined`; always null-check

### Auth flow

Access tokens (JWT, 15 min) + single-use rotating refresh tokens (UUID, SHA-256 hashed in DB, 30 days). On `POST /auth/refresh`: old token is revoked and a new pair is issued. If a revoked token is presented, all sessions for that user are immediately revoked.

Protect a route: `router.get('/path', authenticate, requireRole('admin'), handler)` where `authenticate = createAuthMiddleware(container.authProvider)`.

### Environment

`@constractor/config` validates all env vars at startup via Zod and exports a single typed `config` object. Never read `process.env` directly in application code — always import `config` from `@constractor/config`.

Provider feature flags: `USE_REAL_AI`, `USE_REAL_STORAGE`, `USE_REAL_QUEUE`, `USE_REAL_REALTIME` — all default to `false` (zero-cost local dev). Set to `true` only when the corresponding real provider is implemented.
