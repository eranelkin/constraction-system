# Working Across Multiple Desktops

## Every time you pull new code

```bash
# 1. Start infrastructure (if not running)
docker compose up -d

# 2. Install any new dependencies
pnpm install

# 3. Build shared packages (if types or config changed)
pnpm --filter @constractor/types build
pnpm --filter @constractor/config build

# 4. Run migrations — always do this after pulling
pnpm --filter @constractor/api run db:migrate
```

Step 4 is the most commonly missed. If you see a **500 error** related to a feature that was built on another machine, a missing migration is the first thing to check.

## First-time setup on a new machine

```bash
docker compose up -d
cp .env.example apps/api/.env
pnpm install
pnpm --filter @constractor/types build && pnpm --filter @constractor/config build
pnpm --filter @constractor/api run db:migrate
```

## Restoring from a dump file

Use this when you want to sync your local database to a snapshot from another machine.

```bash
# Stop and remove the postgres container
docker compose stop postgres && docker compose rm -f postgres

# Remove the data volume
docker volume rm constractor-system_postgres_data

# Start a fresh postgres container and wait for it to be ready
docker compose up -d postgres
until docker exec constractor_postgres pg_isready -U constractor -d constractor_dev; do sleep 1; done

# Restore the dump
docker exec -i constractor_postgres psql -U constractor -d constractor_dev < constractor_dump.sql

# Run any migrations that postdate the dump
pnpm --filter @constractor/api run db:migrate
```

> **Note:** Always run migrations after restoring a dump. The dump may have been taken before the latest migrations were applied.

## Creating a dump from your current database

```bash
docker exec constractor_postgres pg_dump -U constractor constractor_dev > constractor_dump.sql
```

## Checklist when switching machines

- [ ] `git pull` — get latest code
- [ ] `pnpm install` — sync dependencies
- [ ] `docker compose up -d` — infrastructure running
- [ ] `pnpm --filter @constractor/api run db:migrate` — apply missing migrations
- [ ] `apps/api/.env` exists and is up to date

## Migration files location

```
apps/api/src/database/migrations/
```

Each file is numbered sequentially (e.g. `007_user_is_active.sql`). The migration runner tracks which have been applied using the `schema_migrations` table and only runs new ones — it is safe to run `db:migrate` multiple times.

## Migration history

| File | What it does |
|---|---|
| `001_initial.sql` | `users` and `refresh_tokens` tables |
| `002_messages.sql` | `messages` table |
| `003_jobs.sql` | `jobs` table |
| `004_rename_roles_and_seed.sql` | Renames roles: client → manager, contractor → member |
| `005_user_language_avatar.sql` | Adds `language`, `avatar_data`, `avatar_mime_type` to `users` |
| `006_groups.sql` | `groups` and `group_members` tables |
| `007_user_is_active.sql` | Adds `is_active BOOLEAN NOT NULL DEFAULT true` to `users` |
| `008_message_translations.sql` | `message_translations(message_id, language, translated_body)` — server-side translation cache |
| `009_construction.sql` | `field_reports`, `schedule_tasks`, `rfis` tables + `rfi_number_seq` sequence |
| `010_rfi_project.sql` | Adds `project VARCHAR(200)` column to `rfis` |
| `011_field_report_photo.sql` | Adds `photo_base64 TEXT` and `photo_mime_type VARCHAR(50)` to `field_reports` |
