# Database Phase 1

This phase adds the PostgreSQL/Prisma foundation for moving away from single-user local JSON storage.

## What Was Added

- `prisma/schema.prisma`: database schema for users, inspirations, tasks, milestones, progress logs, settings, and AI logs.
- `src/db.ts`: shared Prisma Client instance for backend code.
- `scripts/migrate-json-to-db.ts`: one-time migration from the current `app-state.json` file into PostgreSQL.

## Environment

Set `DATABASE_URL` in `server/.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/task_web_demo?schema=public
```

Optional seed identity used by the JSON migration script:

```bash
SEED_USER_EMAIL=demo@task-web.local
SEED_USER_PASSWORD_HASH=local-demo-no-login
SEED_USER_NICKNAME=Demo User
```

## Commands

Generate Prisma Client:

```bash
npm run db:generate --workspace server
```

Push the schema to PostgreSQL:

```bash
npm run db:push --workspace server
```

Migrate the current local JSON state into PostgreSQL:

```bash
npm run db:migrate:json --workspace server
```

## Current Boundary

The existing API still reads and writes the local JSON state. This phase only introduces the database schema, client, and migration path. The next phase should switch service methods from `loadState/saveState` to Prisma queries scoped by `userId`.
