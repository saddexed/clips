# Clips

A full-stack web application built with Next.js, Prisma, PostgreSQL, and Redis-backed workers (BullMQ), orchestrated with Docker.  
This is what [https://clips.saddexed.dev/](https://clips.saddexed.dev/) is based on.

## Prerequisites

Make sure you have the following installed:
- [Node.js](https://nodejs.org/en/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)
- [Docker & Docker Compose](https://www.docker.com/) (for running Postgres, Redis, or the entire stack)

## Getting Started (Development)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory by copying the example or defining the necessary variables:
(You will need connections configured for `DATABASE_URL` and `REDIS_URL` at a minimum.)

### 3. Database Setup (Prisma)

If you're running PostgreSQL locally (e.g., via Docker), initialize your database:

```bash
npx prisma generate
npx prisma db push
```

### 4. Run the Development Server

Start the Next.js frontend:

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 5. Start the Background Worker

In a separate terminal, start the worker process (handles background tasks via BullMQ):

```bash
npx tsx src/worker/index.ts
```

## Getting Started (Prod/Docker)

You can run the entire application stack using Docker Compose.

### Fresh Production Setup 
Drops volumes, rebuilds, pushes DB schema, and restarts:

```bash
docker compose down -v
docker compose up -d --build
docker compose exec -T app npx prisma db push --accept-data-loss
docker compose restart app worker
```

### Update Production
Rebuilds, applies schema updates, and restarts:

```bash
docker compose up -d --build
docker compose exec -T app npx prisma db push --accept-data-loss
docker compose restart app worker
```

## FFMpeg Command Arguments
This is the command used for video processing in the worker, with arguments optimized for VP9 encoding and Opus audio:

```bash
ffmpeg -y -i inputPath -c:v libvpx-vp9 -profile:v 2 -pix_fmt yuv420p10le -deadline good -cpu-used 3 -tile-columns 2 -tile-rows 1 -threads 4 -row-mt 1 -crf 30 -b:v 8M -maxrate 8M -bufsize 16M -c:a libopus -b:a ${audioBitrateKbps}k -f webm
```

The current settings are a balance between quality and encoding speed for an 4 core Oracle ARM server.  
In case you want to adjust the encoding settings, you can modify the arguments as needed. The args reside in `src/lib/ffmpeg.ts` in the `transcodeToWebM` function, which is called by the worker when processing videos.
> [!WARNING]
> **HVC1 Video Encoding Issue**
>
> HVC1 encoded videos may experience frame reversal during transcoding. This appears to be an FFmpeg limitation rather than a project issue. If you encounter this problem and have a solution, please open an issue or reach out to me.



---

## Useful Commands Reference

### Database Commands (Prisma)
- **Generate Client:** `npx prisma generate`
- **Migrate Dev:** `npx prisma migrate dev`
- **Push Schema:** `npx prisma db push`
- **Studio (UI):** `npx prisma studio` (Opens a web-based database editor)
- **Reset DB:** `npx prisma migrate reset --force`
- **Production Push:** `npx prisma db push --accept-data-loss`

### Docker Deployment
- **Start:** `docker compose up -d --build`
- **Stop:** `docker compose down`
