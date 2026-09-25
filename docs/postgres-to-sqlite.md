# Migrating a PostgreSQL deployment to SQLite

For servers still running the Prisma + PostgreSQL + Redis stack (anything before
`0925d7b`). That commit replaced all three at once, so there is no in-place
upgrade path: the old rows have to be exported and re-imported.

`bun run migrate:sqlite3` does **not** do this. It assumes a SQLite database that
already holds the lean schema and only backfills hashes. Nothing in the tree can
read PostgreSQL any more — the `pg` and Prisma dependencies are gone.

`bun run import:postgresql` is the tool for this job. It reads a JSON export and
writes directly into the lean schema, copying media into the vault layout as it
goes.

## What carries over

| Data | Carried | Notes |
| --- | --- | --- |
| Videos, titles, descriptions | Yes | |
| Tags and video/tag links | Yes | Tag rows get fresh UUIDs; names are preserved |
| Job history | Yes | Rows for skipped videos keep `video_id = NULL` |
| App settings | Yes | The two dead comments keys are dropped |
| ffprobe metadata | Yes | Re-shaped into the `metadata` JSON column |
| Original files and transcodes | Copied | Never moved — clean up the old layout by hand |
| Thumbnails | Stay put | `.thumbnails/<id>.webp` is unchanged at HEAD |
| Comments | **No** | The feature was removed in `61914fc` |
| Queued/in-flight jobs | **No** | Redis state is not readable; re-queue after the cutover |

SHA-256 hashes never existed in PostgreSQL, so the importer computes one per
original while copying. That is what makes upload dedupe work afterwards.

## 1. Back up

```bash
sudo docker exec clips-postgres pg_dump -U clips -d clips_db -Fc > ~/clips-pg-backup.dump
```

Media is only ever copied, so the files need no backup — but check free space.
Peak usage roughly doubles until you delete the old layout.

## 2. Export

Substitute your own container, user, and database names. The `to_char` casts are
not optional: the datetime columns are `timestamp without time zone`, so a plain
`json_agg` emits offset-less strings that JavaScript parses as **local** time,
shifting every timestamp by the server's UTC offset. Prisma stored UTC, so the
`Z` has to be reattached explicitly.

```bash
sudo docker exec -i clips-postgres psql -U clips -d clips_db -At <<'SQL' > ~/clips/pg-export.json
\set ts 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
SELECT json_build_object(
  'videos', (SELECT coalesce(json_agg(x),'[]'::json) FROM (
     SELECT id, filename, "originalPath", "processedPath", "originalMetadata", title,
            description, "mediaType"::text, status::text, "originalSize", "processedSize",
            duration, width, height, "isHidden",
            to_char("createdAt",  :'ts') AS "createdAt",
            to_char("uploadedAt", :'ts') AS "uploadedAt",
            to_char("date",       :'ts') AS "date",
            to_char("updatedAt",  :'ts') AS "updatedAt",
            to_char("deletedAt",  :'ts') AS "deletedAt"
     FROM videos) x),
  'tags', (SELECT coalesce(json_agg(t),'[]'::json) FROM tags t),
  'video_tags', (SELECT coalesce(json_agg(j),'[]'::json) FROM "_VideoTags" j),
  'job_history', (SELECT coalesce(json_agg(x),'[]'::json) FROM (
     SELECT id, "videoId", "jobType"::text, status::text, "originalSize", "processedSize",
            "errorMessage", metadata,
            to_char("startedAt",   :'ts') AS "startedAt",
            to_char("completedAt", :'ts') AS "completedAt"
     FROM job_history) x),
  'app_settings', (SELECT coalesce(json_agg(s),'[]'::json) FROM (
     SELECT key, value, to_char(updated_at, :'ts') AS updated_at FROM app_settings) s)
);
SQL
```

`app_settings` is not in `schema.prisma` — the old `src/lib/settings.ts` created
it with raw SQL — so don't be surprised when Prisma tooling doesn't know about it.

## 3. Dry run

Check out this commit or later, `bun install`, and make sure `data/clips.db` does
**not** exist yet. Point `DATA_PATH` at whatever the old `clips-app` container
mounted to `/app/data`:

```bash
sudo docker inspect clips-app --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'

DATA_PATH=/mnt/video_storage DB=./data/clips.db \
  bun run import:postgresql ~/clips/pg-export.json
```

Nothing is written. The report is also your file inventory — read it before going
further:

```
  videos      136 of 136
  tags        17 distinct, 194 links
  history     391 rows (0 orphaned to null)
  settings    2 kept
  media       originals 0 copied, converted 0 copied, thumbnails 136 present
  gaps        0 missing originals, 0 duplicate hashes, 0 missing converted, 0 missing thumbnails
```

Investigate before committing to a write if you see:

- **Missing originals** — `originalPath` rows pointing at files that aren't there.
  Those videos are skipped entirely.
- **Missing converted** — a `processedPath` that no longer resolves. The video
  imports, but only the original is available until it's re-transcoded.
- **Duplicate hashes** — two rows whose originals are byte-identical. Only the
  first survives, because `videos_sha256_hash_idx` is unique.

## 4. Import

```bash
DATA_PATH=/mnt/video_storage DB=./data/clips.db \
  bun run import:postgresql ~/clips/pg-export.json --confirm
```

Media lands as `vault/original/<id><ext>` and `vault/converted/<id>.webm`. Copies
are skipped when the target already exists, so the copy phase is re-runnable. The
importer refuses to run against a non-empty `videos` table — to start over, delete
`data/clips.db` (and its `-shm`/`-wal` siblings) and run it again.

## 5. Verify, then start

Confirm the row count, then bring up the app and worker and click through the
gallery, a viewer page, and the admin history:

```bash
bun run build
bun run start
bun run worker:start
```

Update `.env` while you're there. `DATABASE_URL`, `REDIS_URL`, and
`VIDEO_STORAGE_PATH` are all gone:

```dotenv
DB=./data/clips.db
DATA_PATH=/mnt/video_storage
ADMIN_PASSWORD=...
AUTH_SECRET=...
```

`DB` must be a plain path or a `file:` URL. A driver connection string is
rejected outright rather than silently ignored.

## 6. Retire the old stack

Only once the new deployment looks right:

```bash
sudo docker stop clips-app clips-worker clips-postgres clips-redis
bun run delete:postgresql            # lists what it would remove
bun run delete:postgresql --confirm
```

Then delete the superseded media by hand — `.uploads/` and `processed/` under
your data path. Keep `.thumbnails/`; HEAD still serves from it.

## Notes

- `_VideoTags.A` references `tags`, `.B` references `videos` (Prisma orders
  implicit join columns alphabetically by model name). The importer relies on this.
- Old absolute paths of the form `/app/data/...` resolve correctly without
  rewriting; `toStoredPath` strips that prefix.
- The importer bypasses the `migrateLegacy()` path in `src/lib/database-lean.ts`.
  That function targets an intermediate snake_case SQLite schema, not PostgreSQL,
  and it drops the `description` column on the way through.
