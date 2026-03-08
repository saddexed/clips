---
description: How to Update the Application on the Server
---

### 1. Update the Code
If you've pushed new changes to GitHub, run these on your server:

```bash
# Pull the latest changes
git pull

# Rebuild the images with the new code
docker compose build

# Restart the containers to use the new images
docker compose up -d
```

### 2. Update the Database Schema
If you've modified `prisma/schema.prisma`, you need to sync the database:

```bash
# Push schema changes to the running Postgres container
docker compose exec app npx prisma db push
```

### 3. Update Environment Variables
If you need to change your `DATABASE_URL`, `REDIS_URL`, or any other setting in `.env`:

1. Edit the file: `nano .env`
2. Save and exit (Ctrl+O, Enter, Ctrl+X)
3. Restart the containers to apply the new values:
```bash
docker compose up -d
```

### 4. Viewing Logs
If something goes wrong after an update, check the logs:

```bash
# View all logs
docker compose logs -f

# View logs for just the worker
docker compose logs -f worker
```
