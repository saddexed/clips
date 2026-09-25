# Clips

A Bun-hosted media library built with Next.js. Application records, settings, and the durable background-work queue are stored in `data/clips.db` through `bun:sqlite`.

## Requirements

- [Bun](https://bun.sh/) 1.3 or later
- `ffmpeg` available on `PATH`

## Setup

```bash
bun install
```

The database is created automatically at `./data/clips.db` on the first application or worker start. Configure a different location with `DB`.

```dotenv
DB=./data/clips.db
DATA_PATH=./data
PORT=3000
ADMIN_PASSWORD=your_admin_password
AUTH_SECRET=replace_with_a_long_random_secret
```

`ADMIN_PASSWORD` and `AUTH_SECRET` are required for the administrative API.
`AUTH_SECRET` must contain at least 32 characters.

To explicitly install a generated secret into `.env`, run:

```bash
bun run auth:secret
```

The command does not overwrite an existing value unless `--force` is supplied.

Hidden clips are unlisted: they are excluded from the homepage and public
search, but anyone who has the clip's direct ID can watch or download it.

## Run

Start the web application:

```bash
bun run dev
```

In a separate terminal, start the in-process SQLite worker:

```bash
bun run worker:start
```

For production:

```bash
bun run build

# Start both web server and worker in one terminal (useful for screen/tmux):
bun run start:all

# Or run them in separate terminals/services:
bun run start
bun run worker:start
```

The worker claims one durable SQLite job at a time. Jobs interrupted by a process crash are recovered after their lease expires; failed jobs are retried up to three times. Keep a single app/worker deployment against each database file.

## Migration History & Architecture Note

The project was originally architected around Node.js, PostgreSQL (with Prisma ORM), Redis (with BullMQ), and Docker Compose. It has since been migrated to a lightweight, zero-external-service setup running natively on **Bun** and **SQLite**:

- **Docker & PostgreSQL Removal** ([`0925d7b`](https://github.com/saddexed/clips/commit/0925d7bade4bd6c4f2c25aec6d0108705760d03f) — *feat: switch to Bun and SQLite from Node and PostgreSQL; drop Dockerized setup*):
  - Removed Docker (`Dockerfile`, `docker-compose.yml`) and containerized dependencies.
  - Replaced PostgreSQL and Prisma with native `bun:sqlite`.
  - Replaced Redis and BullMQ with an in-process, durable SQLite worker queue.
- **Workflow Cleanup** ([`a376cc6`](https://github.com/saddexed/clips/commit/a376cc6ca3bc768416c8248c0574a7bb8a429350) — *refactor: simplify video storage schema*):
  - Removed Docker CI/CD publish workflows (`.github/workflows/docker-publish.yml`).
  - Streamlined the database schema and storage layout.
- **Post-Migration Cleanup**:
  - Removed transition scripts (`migrate-sqlite3.ts`, `delete-postgresql.ts`), legacy database backup artifacts, and compatibility shim layers after migration completion.

