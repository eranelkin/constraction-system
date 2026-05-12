# API Service — Security, Performance & Architecture Audit
## Construction Site Management Platform
_Last updated: 2026-05-12 — Scope: apps/api only_

---

## HOW TO READ THIS DOCUMENT

Each issue is tagged with a severity level and contains:
- **Location** — file path + line numbers
- **Issue** — what is wrong
- **Risk** — what an attacker or failure could do
- **Fix** — specific remediation steps

Issues within each severity band are ordered by effort-to-impact ratio: fix the first ones first.

---

## SEVERITY: CRITICAL

---

### C-1 · No Multi-Tenancy / Site Isolation in the Data Model

- **Location**: All migration files, all repositories, entire schema
- **Issue**: There is no `site_id` or `tenant_id` column anywhere in the database. Field reports, RFIs, schedule tasks, groups, jobs, conversations, and media files have no tenant boundary. Every authenticated user on the platform can read every other user's data regardless of which construction site they belong to.
- **Risk**: Complete cross-tenant data leakage. A worker on Site A calls `GET /field-reports` and receives all safety incidents from Site B. On a 50-site deployment with 15,000 workers, every worker can read every RFI, injury report, schedule delay, and private message across all sites.
- **Fix**: Add `site_id UUID NOT NULL REFERENCES sites(id)` to all domain tables (field_reports, rfis, schedule_tasks, groups, jobs, conversations, media_files). Add a `sites` table. Add site context to the JWT (derived server-side from the user's site membership — never from the client). Enforce `WHERE site_id = $user.siteId` at the repository layer in every list and find query. This is foundational architecture work and must be done before any multi-site deployment.

---

### C-2 · Media Access Control: Entity-Tagged Files Are World-Readable

- **Location**: `apps/api/src/modules/media/media.router.ts:58–74`
- **Issue**: The authorization query for `GET /media/serve/*` contains the clause `OR mf.entity_type IS NOT NULL`. Any file that has an `entity_type` set (every photo attached to a field report or RFI) is accessible to every authenticated user on the platform. The check was clearly intended to allow viewing of entity-related media, but it has no scope restriction whatsoever.
- **Risk**: Every field report photo (safety incidents, injuries, structural damage) is readable by any logged-in worker across all sites with no restriction.
- **Fix**: Remove the `OR mf.entity_type IS NOT NULL` clause. Replace it with a proper scope query that verifies the requesting user belongs to the same site as the entity that owns the file. After C-1 is resolved, this becomes `WHERE mf.site_id = $user.siteId AND mf.entity_type IS NOT NULL`.

---

### C-3 · User Deactivation Does Not Revoke Sessions

- **Location**: `apps/api/src/modules/users/users.router.ts:150–178`
- **Issue**: `PATCH /users/:id/active` updates `isActive = false` in the database but never calls `authProvider.revokeAll(id)`. The role-change path on line 124–125 correctly calls `revokeAll` — deactivation does not. A fired worker retains valid access tokens for up to 15 minutes and valid (un-revoked) refresh tokens for 30 days. The `generateTokens` method does check `isActive`, but only when a new token is being generated — existing access tokens are not invalidated.
- **Risk**: A fired worker can continue to read messages, field reports, group conversations, and media for up to 15 minutes, and can re-obtain new access tokens via refresh for 30 days. Instant access termination — the primary security requirement for firing a worker — does not work.
- **Fix**: Add `await authProvider.revokeAll(id)` inside `PATCH /users/:id/active` immediately after setting `isActive = false`. This is a one-line fix.

---

### C-4 · JWT Tokens Exposed in Server Logs via URL Query String

- **Location**: `apps/api/src/modules/media/media.router.ts:34–38`
- **Issue**: The `/media/serve/*` endpoint explicitly accepts `?token=<JWT>` in the query string so that browser `<video>` and `<audio>` elements can authenticate. JWTs in query strings are permanently recorded in: server access logs, nginx/proxy logs, browser history, Referrer headers, CDN edge logs, and any log aggregation system (Datadog, Splunk, CloudWatch).
- **Risk**: Any log system that records query strings captures valid JWTs. Tokens can be replayed for up to 15 minutes by anyone with log access. On a multi-tenant growth path, log aggregation collects thousands of valid credentials per day.
- **Fix**: Issue short-lived (60-second), single-use signed media tickets. Add a `POST /media/ticket` endpoint that returns a UUID stored in Redis with a 60-second TTL bound to the target `storage_key`. The client uses `?ticket=<uuid>` — single-use, not a credential. On the serve route, validate the ticket, mark it consumed, then stream the file.

---

### C-5 · Hardcoded Credentials in docker-compose.yml + Database Ports Exposed

- **Location**: `docker-compose.yml:8–9`, `:12`, `:27`
- **Issue**: `POSTGRES_PASSWORD: constractor` is hardcoded in the committed `docker-compose.yml`. PostgreSQL (`5432:5432`) and Redis (`6379:6379`) are both bound to `0.0.0.0` (all interfaces) on the host. Redis has no `requirepass`. In cloud deployments (EC2, VPS), these services are directly reachable from any network interface on the host unless a firewall is explicitly configured externally.
- **Risk**: Direct database access from the internet. An attacker connects to PostgreSQL with `constractor`/`constractor` or to Redis with no password, reads all user data including password hashes, and can inject arbitrary data.
- **Fix**: Move all credentials to `.env` files excluded from git using `${POSTGRES_PASSWORD}` substitution. Remove host port bindings — services on the same Docker network communicate by service name. Enable Redis `requirepass` via the `redis.conf` command argument. Rotate all credentials that have ever appeared in the repository.

---

### C-6 · `NOT NULL` + `ON DELETE SET NULL` Conflict Causes User Delete Crashes

- **Location**: `apps/api/src/database/migrations/009_construction.sql:8`, `020_fix_not_null_set_null_conflict.sql`
- **Issue**: Migration 009 defines `reported_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL` on `field_reports`, and similarly for `schedule_tasks.created_by` and `rfis.created_by`. PostgreSQL cannot satisfy both constraints simultaneously. Attempting to delete a user who submitted a field report either crashes the delete or leaves inconsistent state. Migration 020 was added to patch it, but this reveals the migration system has no validation layer.
- **Risk**: Deleting any user who submitted a field report, RFI, or schedule task fails at the database level, potentially during a time-sensitive operation like terminating an employee's access.
- **Fix**: Verify Migration 020 applied correctly by running `\d field_reports` in psql and confirming `reported_by` is nullable. Add a CI step that runs all migrations against a fresh database. Wrap each migration in a transaction (see M-10).

---

### C-7 · No Magic-Byte Validation on File Uploads — Client-Supplied MIME Trusted

- **Location**: `apps/api/src/modules/media/media.router.ts:114–116`, `apps/api/src/modules/users/users.router.ts:212–219`, `apps/api/src/modules/field-reports/field-reports.router.ts:47–51`
- **Issue**: Every file upload path trusts the MIME type supplied by the client. In `media.router.ts`, `req.file.mimetype` is the `Content-Type` from the multipart field — entirely attacker-controlled. `parseAvatar` checks against an allowlist string but never reads the actual file bytes. `photoMimeType` in field reports is `z.string().max(50).optional()` — any string accepted.
- **Risk**: An attacker uploads `shell.html` with `Content-Type: video/mp4`. If served with `Content-Type: text/html` (derived from the stored MIME), the browser executes it — stored XSS. If the `LocalStorageProvider` directory ever becomes web-accessible, server-side script execution is trivially achieved.
- **Fix**: Use the `file-type` npm package on every upload. After reading the first bytes of the buffer, verify the detected type is in the allowlist and matches the declared MIME. Reject on mismatch. Restrict `photoMimeType` in field-reports schema to `z.enum(['image/jpeg', 'image/png', 'image/webp'])`.

---

### C-8 · Socket.io: No Rate Limiting on Database-Hitting Event Handlers

- **Location**: `apps/api/src/main.ts:30–44`
- **Issue**: The `join_conversation` and `leave_conversation` socket event handlers each execute a DB query (`isParticipant`) on every invocation with no rate limiting, debouncing, or flood protection. A connected, authenticated user can emit these events thousands of times per second.
- **Risk**: A single authenticated worker floods the server with 10,000 `join_conversation` events/second, each triggering a DB query. With a pool of 10 connections, the database is saturated in milliseconds — denying service to all 300 workers. This is an authenticated DoS that requires no special tools.
- **Fix**: Implement per-socket rate limiting using a token bucket or sliding window. Limit each event type to a reasonable rate (e.g., 5 join/leave operations per second per socket). Use a Redis-backed store so limits survive process restarts and work across instances.

---

## SEVERITY: HIGH

---

### H-1 · Field Reports and RFIs Accessible by All Authenticated Users

- **Location**: `apps/api/src/modules/field-reports/field-reports.router.ts:16–24`, `apps/api/src/modules/rfis/rfis.router.ts:15–22`
- **Issue**: `GET /field-reports` and `GET /rfis` are protected only by `authenticate` middleware — any authenticated user regardless of role can read every record on the platform. No ownership scoping, no role check, no site boundary.
- **Risk**: Workers can read safety incidents, structural defects, RFI responses, and administrative delay logs they have no business seeing. On a multi-site platform this is total data isolation failure.
- **Fix**: Restrict list endpoints to `requireRole('admin', 'manager')` at minimum. After C-1 is resolved, scope all queries to `WHERE site_id = $user.siteId`.

---

### H-2 · Schedule Tasks: No Ownership Check on Write Operations

- **Location**: `apps/api/src/modules/schedule-tasks/schedule-tasks.router.ts`
- **Issue**: `router.use(authenticate, requireRole('admin', 'manager'))` is correctly applied, but there is no ownership check on updates or deletes. Any manager can update or delete any other manager's schedule task entry.
- **Risk**: Managers can tamper with or delete each other's schedule data and falsify delay logs.
- **Fix**: Add an ownership check on PATCH and DELETE: `if (task.createdBy !== req.user.id && req.user.role !== 'admin') throw new ForbiddenError()`.

---

### H-3 · `audioUrl` / `videoUrl` in Messages Not Validated as User-Owned Resources

- **Location**: `apps/api/src/modules/messaging/messaging.router.ts:71–83`
- **Issue**: A user with `canSendVoice`/`canSendVideo` permission can send any arbitrary URL as `audioUrl` or `videoUrl` in a message. The server checks the permission flag but does not verify the URL corresponds to a file in `media_files` uploaded by that user.
- **Risk**: A worker can reference external URLs (e.g., `https://evil.com/malware.mp3`) in messages, injecting arbitrary external content into the platform. It also allows bypassing the file-type allowlist entirely.
- **Fix**: Validate that `audioUrl`/`videoUrl` exist in the `media_files` table (`WHERE url = $1 AND uploaded_by = $userId`) before accepting the message. Reject any URL that does not resolve to a user-owned stored media file.

---

### H-4 · No Security Headers (Helmet Missing)

- **Location**: `apps/api/src/app.ts` — no `helmet()` call
- **Issue**: The Express app returns no security headers: no `Content-Security-Policy`, no `X-Frame-Options`, no `X-Content-Type-Options: nosniff`, no `Strict-Transport-Security`, no `Referrer-Policy`.
- **Risk**: Clickjacking, MIME-sniffing attacks, missing HSTS enforcement, Referrer leakage to third-party hosts.
- **Fix**: `npm install helmet` and add `app.use(helmet())` as the first middleware in `app.ts` before CORS. Configure CSP to whitelist the Socket.io WebSocket origin.

---

### H-5 · No Rate Limiting on AI, Speech, Translation, and Media Upload Endpoints

- **Location**: `apps/api/src/modules/speech/speech.router.ts`, `apps/api/src/modules/translate/translate.router.ts`, `apps/api/src/modules/ai/ai.router.ts`, `apps/api/src/modules/media/media.router.ts`
- **Issue**: Rate limiting exists only on auth endpoints. Speech transcription (Groq API), translation (Groq API), AI field extraction (Groq API), and file upload (disk/memory) have no per-user rate limits.
- **Risk**: A compromised worker account can call `POST /speech/transcribe` in a loop sending 10MB audio blobs, exhausting the Groq API budget and breaking transcription for all real users.
- **Fix**: Apply per-user rate limits: media upload (10 req/min), speech transcription (20 req/min), AI field extraction and translation (30 req/min each). Use a Redis-backed store.

---

### H-6 · Translation Endpoint Has No Max Text Length

- **Location**: `apps/api/src/modules/translate/translate.router.ts:23`
- **Issue**: The only text validation is `!text || typeof text !== 'string' || !text.trim()`. No maximum length is enforced. A user can send a 50MB string to the Groq translation API.
- **Risk**: API abuse via oversized payloads. Memory pressure. Groq timeout errors cascading to users as failures.
- **Fix**: Add `z.string().min(1).max(10000)` in a Zod schema for the translate endpoint body, consistent with the AI extraction endpoint which correctly limits to 2000 chars.

---

### H-7 · Speech Transcription `mimeType` Not Validated Against Allowlist

- **Location**: `apps/api/src/modules/speech/speech.router.ts:20–30`
- **Issue**: `mimeType` is accepted as any string and passed directly to `container.speechProvider.transcribe()`, which embeds it as a `Blob` type sent to Groq. No allowlist validation.
- **Risk**: Unexpected behavior from the Groq API. Potential header injection in the multipart boundary if the MIME string contains special characters.
- **Fix**: Validate against `z.enum(['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac'])`.

---

### H-8 · File Uploads Load Entire File into Node.js Heap

- **Location**: `apps/api/src/modules/media/media.router.ts:20–23`
- **Issue**: `multer.memoryStorage()` with a 50MB limit loads each uploaded file entirely into Node.js heap memory before any processing. With 300 workers simultaneously uploading videos, this is 300 × 50MB = 15GB of heap pressure.
- **Risk**: Node.js OOM crash under normal production load. Even at 10 concurrent uploads, GC pauses degrade response times across the whole API — Node.js is single-threaded.
- **Fix**: Switch to `multer.diskStorage()` for temporary files, or stream directly to object storage (S3/MinIO). Accept the upload, move it to object storage, return a job ID immediately, and notify via Socket.io when processing is complete (async pattern via BullMQ).

---

### H-9 · No Pagination on Any List Endpoint

- **Location**: `apps/api/src/modules/field-reports/field-reports.router.ts:16–24`, `rfis.router.ts:15–22`, `schedule-tasks.router.ts:14–22`, `users.router.ts:39–45`, `groups.router.ts:30–33`
- **Issue**: All list endpoints return unbounded result sets. No `LIMIT`/`OFFSET` or cursor-based pagination on any of them.
- **Risk**: With 10,000 field reports after months of operation, `GET /field-reports` returns all 10,000 in one response. The DB sorts and transmits hundreds of MB, Node.js buffers it all in memory, and the client freezes rendering it.
- **Fix**: Add `LIMIT $N OFFSET $M` to all list queries. Expose `?page=1&pageSize=50` query params (validated via Zod, max 100 per page). Return `{ data, total, page, pageSize }`.

---

### H-10 · `SELECT * FROM users` Fetches Binary Avatar Blobs on Every List Call

- **Location**: `apps/api/src/database/repositories/UserRepository.ts:64–69`
- **Issue**: `listAllFull()` executes `SELECT * FROM users` which includes `avatar_data` (binary blob, up to 2MB per user) for every user. This is called on every admin panel load and also by `PATCH /settings` just to get user IDs for a realtime broadcast.
- **Risk**: With 300 workers each having a 2MB avatar, every admin panel load transfers 600MB from PostgreSQL to Node.js.
- **Fix**: Exclude `avatar_data` from list queries by naming columns explicitly. The avatar is already served separately via `GET /users/:id/avatar`. For the settings broadcast, add a `listAllIds(): Promise<string[]>` method and use that instead.

---

### H-11 · Database Connection Pool Too Small for 300 Concurrent Workers

- **Location**: `apps/api/src/database/adapters/PostgreSQLAdapter.ts:10`
- **Issue**: `max: 10` connections. Each HTTP request holds a pool connection for its duration. Socket.io event handlers that hit the DB compound this. With 300 simultaneous workers, 290 requests queue behind 10 active connections and time out after 5 seconds (`connectionTimeoutMillis: 5000`).
- **Risk**: The platform becomes unresponsive precisely when it matters most — when a shift starts and 300 workers open the app simultaneously.
- **Fix**: Increase pool to 50–100. Set PostgreSQL `max_connections` to 200+ in `postgresql.conf`. Add PgBouncer as a connection pooler in front of PostgreSQL to handle burst spikes.

---

### H-12 · No Circuit Breaking on Groq AI Provider Calls

- **Location**: `apps/api/src/providers/speech/GroqSpeechProvider.ts:15–25`, `apps/api/src/providers/translation/GroqTranslationProvider.ts`
- **Issue**: All `fetch` calls to Groq have no timeout. Node.js `fetch` has no default timeout — a slow or hung Groq response holds the connection open indefinitely. AI calls block the request/response cycle; the `InMemoryQueueProvider` is not used for them.
- **Risk**: During a Groq outage, all in-flight speech and translation requests hang. With a pool of 10 DB connections and 300 workers, 10 hung Groq requests starve the database, crashing the entire API for unrelated operations.
- **Fix**: Add `AbortSignal.timeout(15_000)` to all Groq `fetch` calls. Implement exponential backoff with jitter. Return a graceful error to the client ("AI service temporarily unavailable"). Consider the `opossum` circuit breaker library.

---

### H-13 · No Audit Logging for Sensitive Operations

- **Location**: Throughout all routers
- **Issue**: There is no structured audit trail for: user deactivation/deletion, permission changes (`canSendVoice`, `canSendVideo`, role changes), message deletion, media deletion, or any admin action. All logging is `console.error` for unhandled errors only.
- **Risk**: Cannot detect or investigate security incidents. If a fired worker's account is accessed before revocation, there is no log. GDPR and SOC2 compliance require immutable audit logs.
- **Fix**: Add an `audit_logs` table with columns `(id, actor_id, action, target_type, target_id, metadata, ip_address, created_at)`. Write a record for every state-changing admin operation.

---

### H-14 · AI Operations Are Synchronous — No Async Queue Pattern

- **Location**: `apps/api/src/modules/speech/speech.router.ts:30`, `apps/api/src/modules/ai/ai.router.ts:25`
- **Issue**: Speech transcription and AI field extraction block the HTTP request/response cycle. The client waits for the full Groq round-trip (1–5 seconds) before receiving a response. The `InMemoryQueueProvider` exists but is not used for these operations.
- **Risk**: 300 workers all recording voice notes at shift start → 300 simultaneous Groq calls → all API connections saturated → the platform is unresponsive for everyone. This is expected normal usage, not an attack.
- **Fix**: Return a `jobId` immediately on audio submission. Process via BullMQ in a background worker. Notify the client via Socket.io when the transcript is ready. This also enables retry logic on Groq failures.

---

### H-15 · Socket.io Redis Adapter Not Implemented

- **Location**: `apps/api/src/providers/realtime/SocketIOProvider.ts`, `apps/api/src/container.ts:80`
- **Issue**: The Socket.io server has no Redis adapter. Socket state (room memberships, connected clients) exists only in the memory of a single process.
- **Risk**: Running 2+ API instances — necessary for 300 concurrent WebSocket connections at production load — silently breaks message delivery. Messages sent by Instance A only reach clients connected to Instance A. The system appears to work in single-instance testing but silently fails at scale.
- **Fix**: `npm install @socket.io/redis-adapter`. Configure with the existing Redis connection. Redis is already in the stack for this purpose.

---

### H-16 · API Does Not Translate Messages Server-Side — Forces Client Fan-Out

- **Location**: `apps/api/src/database/repositories/MessageRepository.ts:98–109`, `apps/api/src/modules/translate/translate.router.ts`
- **Issue**: The `MessageRepository.list()` method checks the translation cache and attaches cached translations, but it does not populate the cache on a miss. Clients must call `POST /translate` individually for each untranslated message. With 50 messages per conversation load and 300 workers opening chats simultaneously, this is up to 15,000 simultaneous Groq API calls per shift start.
- **Risk**: Groq API rate limit exhaustion, cost spikes, and translation failures manifesting as blank messages for all workers simultaneously.
- **Fix**: On a cache miss inside `MessageRepository.list()`, call the translation provider and persist the result to `message_translations` before returning. The `TranslationCacheRepository` is already wired in — close the loop so the repository self-populates the cache and clients never need to fan out individual translate calls.

---

### H-17 · `DEV_SECRETS` Guard Only Runs in Production Mode

- **Location**: `packages/config/src/env.ts:3–46`
- **Issue**: `DEV_SECRETS = ['dev-access-secret-change-in-prod']` is only checked when `NODE_ENV === 'production'`. A staging server running `NODE_ENV=staging` or `NODE_ENV=development` bypasses the check entirely and may be deployed with the default weak JWT secret.
- **Risk**: A staging server with the default weak JWT secret allows admin tokens to be forged, compromising any real user data in staging.
- **Fix**: Enforce `ACCESS_TOKEN_SECRET` minimum entropy unconditionally (e.g., `z.string().min(32)`) regardless of `NODE_ENV`. Remove the `DEV_SECRETS` concept.

---

### H-18 · Migration Runner Has No Advisory Lock — Race on Multi-Instance Start

- **Location**: `apps/api/src/database/migrate.ts`
- **Issue**: The migration runner does not acquire a PostgreSQL advisory lock before checking or running migrations. If two API instances start simultaneously, they can interleave — reading the same pending migrations and attempting to apply them concurrently.
- **Risk**: Duplicate constraint creation errors, partial migrations applied twice, or `schema_migrations` insert failing on a race on the primary key.
- **Fix**: Add `await db.query("SELECT pg_advisory_lock(987654321)")` before the migration loop and `pg_advisory_unlock` after. Or adopt `node-pg-migrate` which handles locking natively.

---

## SEVERITY: MEDIUM

---

### M-1 · Path Traversal: Uploaded File Path Not Anchored to Upload Directory

- **Location**: `apps/api/src/providers/storage/LocalStorageProvider.ts:51–54`, `apps/api/src/modules/media/media.router.ts:52–53`
- **Issue**: The serve route checks `storageKey.includes('..')` but does not verify the resolved `join(uploadDir, key)` stays within `uploadDir`. If `UPLOAD_DIR` is misconfigured (e.g., set to `/`), path traversal is wide open.
- **Risk**: An attacker reads arbitrary files on the filesystem. If `uploads/` is ever pointed at by a static web server, files are served without authentication.
- **Fix**: After `join(uploadDir, key)`, assert `resolvedPath.startsWith(path.resolve(uploadDir))` and throw a 400 if it fails. Long-term: move to S3/MinIO where this class of vulnerability does not exist.

---

### M-2 · No Input Validation on `translate.router.ts` for `targetLanguage` and `messageId`

- **Location**: `apps/api/src/modules/translate/translate.router.ts:17–30`
- **Issue**: `targetLanguage` and `messageId` are read from `req.body` with only `typeof` checks — no Zod schema, no language code format check, no UUID format check for `messageId`.
- **Fix**: Use Zod: `targetLanguage: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional()`, `messageId: z.string().uuid().optional()`.

---

### M-3 · Refresh Token Table Grows Unboundedly — No Cleanup Job

- **Location**: `apps/api/src/database/migrations/001_initial.sql`
- **Issue**: Every login creates a new `refresh_tokens` row. Every refresh creates a new row and marks the old one revoked. There is no scheduled job to delete expired or revoked tokens, and no index on `expires_at`.
- **Risk**: After months of operation with 300 workers logging in daily, the table has millions of rows. `revokeAll` slows down. Disk grows without bound.
- **Fix**: Add `CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`. Add a nightly cleanup: `DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day'`.

---

### M-4 · Unhandled Promise Rejections in Socket.io Event Handlers

- **Location**: `apps/api/src/main.ts:30–44`
- **Issue**: Async socket event handlers are not wrapped in try/catch. The `await container.conversationRepository.isParticipant(...)` call is outside any error boundary — a transient database error causes an unhandled promise rejection.
- **Risk**: In Node.js 15+, unhandled promise rejections terminate the process. A brief database hiccup during shift start crashes the entire API.
- **Fix**: Wrap every async socket handler body in `try { ... } catch (err) { console.error('[socket]', err); }`. Add a global `process.on('unhandledRejection', ...)` handler as a backstop.

---

### M-5 · `POST /groups/:id/members` Does Not Validate `userId` as UUID

- **Location**: `apps/api/src/modules/groups/groups.router.ts:154–155`
- **Issue**: `const { userId } = req.body as { userId?: string }` — accepted as any truthy string with no UUID validation or user existence check. The FK constraint rejects invalid UUIDs at the DB level, but the error surfaces as a 500.
- **Fix**: `const userId = z.string().uuid().parse(req.body.userId ?? '')`. Add a user existence check before the insert.

---

### M-6 · `GET /auth/users` Enables User Enumeration Across All Sites

- **Location**: `apps/api/src/modules/auth/auth.router.ts:76–82`
- **Issue**: Any authenticated user, including `role: 'member'` workers, can call `GET /auth/users` and receive display names and UUIDs of all non-admin users on the platform with no site boundary.
- **Risk**: Without site isolation (C-1), a worker enumerates all workers across all construction sites.
- **Fix**: Restrict to manager/admin roles, or scope results to the same site after C-1 is implemented.

---

### M-7 · Seed Script Prints Plaintext Passwords to Console

- **Location**: `apps/api/src/database/seeds/dev-users.ts:24`
- **Issue**: `console.log(` ... / ${u.password}`)` echoes plaintext passwords to stdout. If this runs in a CI/CD pipeline with log aggregation, credentials appear in logs permanently.
- **Fix**: Remove the password echo. Document dev credentials in a local `README.dev.md` not committed to git, or a team password vault.

---

### M-8 · Seed Script Has No Guard Against Running in Production

- **Location**: `apps/api/src/database/seeds/dev-users.ts`
- **Issue**: The seed reads `config.DATABASE_URL` with no `NODE_ENV` check. If run against a production database, it inserts `admin@constractor.dev / Admin1234!`.
- **Risk**: Backdoor admin account in production.
- **Fix**: Add `if (config.NODE_ENV === 'production') throw new Error('Cannot run seeds in production')` at the top of the script.

---

### M-9 · Message Pagination Breaks on Duplicate Timestamps

- **Location**: `apps/api/src/database/repositories/MessageRepository.ts:63–95`
- **Issue**: Message cursor pagination uses `m.created_at > (SELECT created_at FROM messages WHERE id = $2)`. If two messages share the exact same `created_at` timestamp (possible with fast bulk inserts), pagination skips or duplicates messages.
- **Fix**: Use stable keyset pagination on `(created_at, id)`: `WHERE (m.created_at, m.id) > ($cursor_ts, $cursor_id)` with a composite index on `(conversation_id, created_at, id)`.

---

### M-10 · Migration Runner Is Not Transactional Per Migration File

- **Location**: `apps/api/src/database/migrate.ts:35–37`
- **Issue**: Each migration file is run as a single `db.query(sql)`. If a migration contains multiple SQL statements and the second fails, the first has already committed. The migration is not recorded in `schema_migrations`, so re-running will attempt the first statement again — likely failing with a conflict error.
- **Risk**: Database in a half-migrated state with no clean recovery path.
- **Fix**: Wrap each migration file in a transaction: `await db.transaction(async (tx) => { await tx.query(sql); await tx.query('INSERT INTO schema_migrations ...', [file]); })`.

---

### M-11 · Dev Router Has No Authentication

- **Location**: `apps/api/src/app.ts:51–53`, `apps/api/src/modules/dev/dev.router.ts`
- **Issue**: The dev router (`POST /dev/clear-messages` — deletes all messages) is only gated by `config.NODE_ENV !== 'production'`. It has zero authentication. A staging server running `NODE_ENV=development` allows any unauthenticated client to wipe all messages.
- **Fix**: Even in dev, add `requireRole('admin')`. Consider removing the route entirely and replacing it with a local-only script.

---

### M-12 · No Slow Query Logging Configured

- **Location**: `docker-compose.yml`
- **Issue**: PostgreSQL runs with no `log_min_duration_statement`. The complex lateral-join query in `GET /media/files` (`media.router.ts:159–188`) will degrade silently under load.
- **Fix**: Add `command: postgres -c log_min_duration_statement=500` to the postgres service in `docker-compose.yml`. Enable the `pg_stat_statements` extension for query analysis.

---

### M-13 · `InMemoryQueueProvider` Accumulates Completed Jobs Forever

- **Location**: `apps/api/src/providers/queue/InMemoryQueueProvider.ts:11`
- **Issue**: `private jobs = new Map<string, StoredJob>()` — jobs reach `done` or `failed` but are never removed. All completed jobs accumulate in memory for the lifetime of the process.
- **Risk**: Slow memory leak. In a long-running production process, this grows without bound.
- **Fix**: After a job reaches terminal status, schedule deletion: `setTimeout(() => this.jobs.delete(jobId), 60_000)`. This is dev-only code — implement BullMQ for production.

---

### M-14 · `/health` Endpoint Has No Dependency Check and Leaks Version

- **Location**: `apps/api/src/app.ts:28–33`
- **Issue**: The public `/health` endpoint returns `{ status: 'ok' }` regardless of whether PostgreSQL or Redis are reachable. It also exposes `process.env['npm_package_version']` with no authentication.
- **Risk**: A load balancer performing health checks routes traffic to an instance with a dead database. The version aids in version-specific CVE targeting.
- **Fix**: Add a DB ping: `const dbOk = await db.queryOne('SELECT 1').then(() => true).catch(() => false)`. Return `503` with `{ status: 'degraded' }` when the DB is down. Remove the `version` field from the public response.

---

### M-15 · `isTest` Environment Variable Disables Rate Limiting Globally

- **Location**: `apps/api/src/modules/auth/auth.router.ts:7`
- **Issue**: `const isTest = process.env.VITEST === 'true'`. If `VITEST=true` is set accidentally in a non-test environment (CI misconfiguration, env bleed), rate limiting is disabled globally on all auth endpoints.
- **Fix**: Use `process.env.NODE_ENV === 'test'` instead. Add a warning log if rate limiting is disabled when `NODE_ENV === 'production'`.

---

## SEVERITY: LOW

---

### L-1 · Zod Validation Errors Leak Full Schema in Production

- **Location**: `apps/api/src/shared/middleware/errorHandler.ts:13–17`
- **Issue**: `err.flatten().fieldErrors` is returned directly to clients, exposing exact field names and constraint details in every validation failure response.
- **Fix**: In production (`config.NODE_ENV === 'production'`), return `{ error: 'Validation failed', code: 'VALIDATION_ERROR' }` only. Log the detailed field errors server-side.

---

### L-2 · `.env` File May Have Been Committed to Git

- **Location**: `apps/api/.env` (exists on filesystem)
- **Issue**: The `.env` file is present in the repository directory. If it was ever tracked by git, secrets are in the git history permanently.
- **Fix**: Run `git log --all --full-history -- apps/api/.env` to verify it was never committed. Ensure `**/.env` and `**/.env.local` are in `.gitignore`. Add `git-secrets` or `detect-secrets` as a pre-commit hook.

---

### L-3 · `image/gif` Allowed in Avatar Uploads

- **Location**: `apps/api/src/modules/users/users.router.ts:9`
- **Issue**: `ALLOWED_MIME` includes `image/gif`. GIF files can contain polyglot payloads (valid GIF + valid JavaScript) that are exploitable in certain browser contexts.
- **Fix**: Remove `image/gif` from the allowlist. Accept only `image/jpeg`, `image/png`, `image/webp`.

---

## PRIORITIZED FIX LIST — ORDERED BY IMPACT × EFFORT

| # | ID | Fix | Est. Effort |
|---|----|-----|-------------|
| 1 | C-3 | Call `authProvider.revokeAll()` on user deactivation | 30 min |
| 2 | C-5 | Remove host port bindings for PostgreSQL/Redis; add Redis auth | 1 hour |
| 3 | H-4 | Add `helmet()` security headers to Express app | 1 hour |
| 4 | H-11 | Increase DB connection pool to 50–100 | 30 min |
| 5 | C-2 | Remove `OR mf.entity_type IS NOT NULL` from media auth query | 2 hours |
| 6 | M-15 | Fix `isTest` rate limit bypass — use `NODE_ENV === 'test'` | 15 min |
| 7 | M-8 | Add production guard to seed script | 30 min |
| 8 | M-7 | Remove plaintext password echo from seed output | 15 min |
| 9 | H-17 | Enforce JWT secret minimum entropy unconditionally | 1 hour |
| 10 | H-7 | Add MIME allowlist to speech transcription endpoint | 1 hour |
| 11 | H-6 | Add max length to translation endpoint body (Zod schema) | 1 hour |
| 12 | M-2 | Add Zod validation to translate endpoint body | 1 hour |
| 13 | H-5 | Rate limit AI, speech, translation, media upload endpoints | 4 hours |
| 14 | C-8 | Rate limit Socket.io `join_conversation`/`leave_conversation` | 4 hours |
| 15 | C-7 | Add magic-byte MIME validation for all file uploads | 4 hours |
| 16 | H-3 | Validate `audioUrl`/`videoUrl` in messages against `media_files` | 4 hours |
| 17 | M-4 | Wrap async socket handlers in try/catch | 1 hour |
| 18 | M-11 | Add `requireRole('admin')` to dev router | 30 min |
| 19 | H-10 | Exclude `avatar_data` from `SELECT *` in list queries | 2 hours |
| 20 | M-3 | Add index on `refresh_tokens.expires_at`; add cleanup job | 2 hours |
| 21 | H-9 | Add pagination to all list endpoints | 1 day |
| 22 | M-9 | Fix message pagination to use stable `(created_at, id)` keyset | 2 hours |
| 23 | H-12 | Add `AbortSignal.timeout()` to all Groq `fetch` calls | 2 hours |
| 24 | M-14 | Add dependency health checks to `/health` endpoint | 2 hours |
| 25 | H-18 | Add advisory lock to migration runner | 2 hours |
| 26 | M-10 | Wrap each migration file in a transaction | 2 hours |
| 27 | H-1 | Restrict field report and RFI list to admin/manager roles | 1 hour |
| 28 | H-2 | Add ownership check to schedule task PATCH/DELETE | 1 hour |
| 29 | H-8 | Switch from `multer.memoryStorage()` to disk/streaming | 1 day |
| 30 | H-13 | Add structured audit logging table and middleware | 1 day |
| 31 | H-14 | Make speech transcription asynchronous (BullMQ + Socket.io notify) | 2 days |
| 32 | H-15 | Add Socket.io Redis adapter | 4 hours |
| 33 | H-16 | Move translation to server-side in `MessageRepository.list()` | 1 day |
| 34 | C-4 | Replace JWT-in-URL with short-lived single-use media tickets | 1 day |
| 35 | C-1 | Add `site_id` multi-tenancy to all domain tables *(foundational)* | 5–10 days |

---

## MISSING FEATURES — NOT PRESENT AT ALL

| Feature | Impact |
|---------|--------|
| Multi-tenancy / site isolation | Data separation between construction sites — currently absent entirely |
| Security headers (CSP, HSTS, X-Frame-Options) | XSS amplification, clickjacking, MIME-sniffing |
| Audit log table | Compliance (GDPR, SOC2); incident investigation |
| Redis adapter for Socket.io | Required for any horizontal scaling |
| S3/MinIO object storage | Persistence, multi-instance compatibility, CDN distribution |
| BullMQ for background jobs | Async video/audio processing; retry logic on AI failures |
| Account lockout / brute force protection | Per-IP rate limiting exists but no persistent per-account lockout |
| Malware scanning of uploads | No AV scanning (ClamAV or cloud equivalent) for uploaded files |
| Refresh token cleanup job | Table grows forever; no TTL-based deletion |
| Structured logging + correlation IDs | Cannot trace a user-reported issue to a server log entry |
| Database least-privilege user | App DB user should not have `DROP TABLE` rights |
| Request readiness probe | `/health` returns `ok` even when the DB is down |
| Media access revocation after deactivation | A fired worker's previously uploaded media remains accessible indefinitely |
| Email verification flow | No mechanism to verify user email ownership at registration |

---

## SCALABILITY BOTTLENECK SUMMARY

What breaks first as load grows from 1 site (300 workers) to 50 sites (15,000 workers):

| Order | Bottleneck | Breaks At | Root Cause |
|-------|-----------|-----------|------------|
| 1st | **Node.js heap OOM** | ~10 concurrent large video uploads | `multer.memoryStorage()` × 50MB per upload |
| 2nd | **DB connection starvation** | ~20 simultaneous requests | Pool `max: 10`; every request holds a slot |
| 3rd | **AI request pile-up / cascade** | First Groq slowdown | No timeouts or circuit breakers on Groq `fetch` |
| 4th | **Socket.io cross-instance silence** | 2nd API process starts | No Redis adapter; events only reach co-located sockets |
| 5th | **Refresh token table full-scan** | ~6 months of operation | No index on `expires_at`; no cleanup job |
| 6th | **Avatar blob fetching** | ~500 users with avatars | `SELECT *` includes up to 2MB avatar per user in every list call |
| 7th | **Unbounded list result sets** | ~5,000 field reports or RFIs | No `LIMIT` on any list endpoint |
| 8th | **Settings broadcast O(n) loop** | ~5,000 users | `for (const u of users) emit()` + `listAllFull()` per settings change |
| 9th | **Cross-tenant data leakage** | 2nd construction site onboards | No `site_id` — all data globally visible to all authenticated users |
| 10th | **Local disk storage lost on restart** | Container restart / 2nd instance | Uploads not on shared storage; files inaccessible after redeploy |
