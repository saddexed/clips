# ── Stage 1: Dependencies ──────────────────────────────────────────────
FROM node:20-alpine AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── Stage 2: Build ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci

# Copy all source including prisma config and schema
COPY . .

# Generate Prisma Client to src/generated/prisma
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Build Next.js in standalone mode
RUN npm run build

# ── Stage 3: Production ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_PATH=/app/data

# Install FFmpeg for video processing
RUN apk add --no-cache ffmpeg

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 nextjs

# Create the four workflow directories and assign ownership
RUN mkdir -p /app/data/temp \
             /app/data/processing \
             /app/data/processed \
             /app/data/vault \
    && chown -R nextjs:nodejs /app/data

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy full production node_modules for the worker script
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy full source for worker (tsx execution)
COPY --from=builder --chown=nextjs:nodejs /app/src ./src

# Copy Prisma artifacts (schema, migrations, generated client)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

EXPOSE 6119

ENV PORT=6119
ENV HOSTNAME="0.0.0.0"

# Switch to non-root user before running
USER nextjs

CMD ["node", "server.js"]
