# PROJECT_STATE.md

> Last updated: 2026-03-07

---

## Current Architecture

| Service      | Image / Build              | Port  | Volume / Mount                            |
|-------------|---------------------------|-------|------------------------------------------|
| **PostgreSQL** | `postgres:16-alpine` | 5432  | Named volume `pgdata`                   |
| **Redis**      | `redis:7-alpine`     | 6379  | Named volume `redisdata`                |
| **Next.js App**| Local `Dockerfile`   | 3000  | Bind mount `/mnt/video_storage` → `/app/data` |
| **FFmpeg Worker**| Local `Dockerfile` | None  | Bind mount `/mnt/video_storage` → `/app/data` |

**Network:** `clips-network` (bridge)

---

## Database Progress

### Prisma Models (Defined — Not Yet Migrated)

| Model        | Key Fields                                                                                           |
|-------------|------------------------------------------------------------------------------------------------------|
| `Video`      | `id`, `filename`, `originalPath`, `processedPath`, `originalMetadata` (Json), `title`, `description`, `status` (enum), `originalSize`, `processedSize`, `duration`, `width`, `height` |
| `Comment`    | `id`, `content`, `videoId` (FK → Video), `createdAt`                                               |
| `Tag`        | `id`, `name` (unique), many-to-many with Video via `_VideoTags`                                     |
| `JobHistory` | `id`, `videoId` (FK → Video), `jobType` (enum), `status` (enum), sizes, timestamps, `errorMessage` |

### Enums
- `VideoStatus`: `UPLOADING | QUEUED | PROCESSING | COMPLETED | FAILED`
- `JobType`: `TRANSCODE | THUMBNAIL | METADATA_EXTRACT`
- `JobStatus`: `PENDING | RUNNING | COMPLETED | FAILED`

### Pending Migrations
- Initial migration `20260307113804_init` has been applied successfully. Database is synced.

---

## Folder Workflow Status

| Directory      | Path (in container) | Purpose                       | Status    |
|---------------|--------------------|-----------------------------|-----------|
| `temp/`        | `/app/data/temp`        | Browser upload landing zone   | Active in API |
| `processing/`  | `/app/data/processing`  | Active FFmpeg jobs            | Active in Worker |
| `processed/`   | `/app/data/processed`   | Finished WebM files           | Active in Worker |
| `vault/`       | `/app/data/vault`       | Production storage            | Active in Worker |

> Atomic move logic between directories is **fully implemented** in `src/worker/index.ts`.

---

## Completed Tasks

- [x] `docker-compose.yml` — PostgreSQL, Redis, App (ARM64)
- [x] `Dockerfile` — Multi-stage build with FFmpeg, workflow dirs
- [x] `prisma/schema.prisma` — Video, Comment, Tag, JobHistory models
- [x] `src/lib/prisma.ts` — Singleton Prisma client
- [x] `package.json`, `tsconfig.json`, `next.config.ts` — Project scaffolding
- [x] `.env`, `.dockerignore`, `.gitignore` — Environment & build config
- [x] Minimal Next.js app entry (`layout.tsx`, `page.tsx`)

---

## Pending Tasks

- [x] Run `npm install` and first Prisma migration
- [x] Upgrade dependencies to latest (Prisma v7, Next.js 16+, Node 25 compatibility)
- [x] Implement Prisma v7 Driver Adapter (`@prisma/adapter-pg`)
- [x] Upload API route (`POST /api/upload`) with chunked streaming to `temp/`
- [x] BullMQ worker: FFmpeg transcode pipeline (`temp → processing → processed → vault`)
- [x] Metadata extraction via `ffprobe` (populate `originalMetadata`, `duration`, `width`, `height`)
- [x] Admin Panel — **Manage** tab: searchable data table for video CRUD
- [x] Admin Panel — **Tasks** tab: real-time BullMQ queue monitor
- [x] Admin Panel — Global Drag & Drop provider component
- [x] Admin Panel — Video editor Modal (`PATCH /api/videos/[id]`)
- [ ] Video playback page with comments and tags UI

---

## Handoff Instruction

> **Step 4 (Robust Manage Actions & Global Uploader) is fully implemented.** The old dedicated upload tab was annihilated and replaced with a global drag-and-drop overlay context provider. The table was transformed into a client component with a popup editor. The worker natively unlinks raw redundant MP4 files. Awaiting manual user validation before moving to Step 5 (Public Video Playback Page).
