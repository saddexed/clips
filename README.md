# Clips

A Bun-hosted media library built with Next.js. Application records, settings, and the durable background-work queue are stored in `data/clips.db` through `bun:sqlite`.

## Requirements

- [Bun](https://bun.sh/) 1.3 or later
- `ffmpeg` available on `PATH`

## Setup

```bash
bun install
```

The database is created automatically at `./data/clips.db` on the first application or worker start. Configure a different location with `DB`, using a plain path or a `file:` URL.

```dotenv
DB=./data/clips.db
DATA_PATH=./data
ADMIN_PASSWORD=your_admin_password
AUTH_SECRET=replace_with_a_long_random_secret
```

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
bun run start
bun run worker:start
```

The worker claims one durable SQLite job at a time. Jobs interrupted by a process crash are recovered after their lease expires; failed jobs are retried up to three times. Keep a single app/worker deployment against each database file.

## Migration Note

PostgreSQL data cannot be read directly from `clips.db`. To bring an older
PostgreSQL deployment across, export its records and replay them with
`bun run import:postgresql` — see [`misc/postgres-to-sqlite.md`](misc/postgres-to-sqlite.md).
