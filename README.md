# Clips

A Bun-hosted media library built with Next.js. Application records, settings, and the durable background-work queue are stored in `data/clips.db` through `bun:sqlite`.

## Requirements

- [Bun](https://bun.sh/) 1.3 or later
- `ffmpeg` available on `PATH`

## Setup

```bash
bun install
```

The database is created automatically at `file:./data/clips.db` on the first application or worker start. Configure a different location with `DATABASE_URL` using a `file:` URL.

```dotenv
DATABASE_URL=file:./data/clips.db
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

This migration creates a new SQLite database. Export existing PostgreSQL records before retiring the old deployment if its library or history must be retained; PostgreSQL data cannot be read directly from `clips.db`.
