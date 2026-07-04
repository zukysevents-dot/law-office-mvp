# syntax=docker/dockerfile:1

# ---- Builder ---------------------------------------------------------------
# Prisma 7 uses the new `prisma-client` generator with no pinned binaryTargets.
# We generate the client *inside* the image so the query engine matches the
# runtime platform — this sidesteps the classic "engine built for the host,
# copied into a Linux container" mismatch. openssl is required by the engine.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install deps first (better layer caching). postinstall runs `prisma generate`,
# which needs the schema present — so copy prisma/ before `npm ci`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Build. prebuild re-runs `prisma generate` (idempotent), then `next build`.
# No DB and no secrets are needed at build time (all pages are dynamic and no
# NEXT_PUBLIC_* values are inlined).
COPY . .
RUN npm run build

# ---- Runner ----------------------------------------------------------------
# Full node_modules are kept (not pruned) so the Prisma CLI stays available for
# `prisma migrate deploy`. Image size is traded for a simpler, less error-prone
# deploy — fine for an internal app.
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app ./

RUN chown -R node:node /app
USER node

EXPOSE 3000

# `npm start` binds 127.0.0.1 (dev convenience) — bind 0.0.0.0 so Caddy (a
# separate container) can reach it.
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
