# ── Stage 1: Dependencies ──────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# ── Stage 2: Build ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

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

# Create the four workflow directories
RUN mkdir -p /app/data/temp \
             /app/data/processing \
             /app/data/processed \
             /app/data/vault

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy full production node_modules for the worker script
COPY --from=deps /app/node_modules ./node_modules

# Copy full source for worker (tsx execution)
COPY --from=builder /app/src ./src

# Copy Prisma artifacts (schema, migrations, generated client)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated

EXPOSE 6119

ENV PORT=6119
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
