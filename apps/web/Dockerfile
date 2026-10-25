# Multi-stage Production Dockerfile for Next.js Frontend (apps/web)
# Build context: repository root (.)
# Example: docker build -f apps/web/Dockerfile -t cnc-web .

FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy dependency manifests
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./
# Copy shared game engine definitions needed by @games alias in tsconfig.json
COPY apps/game ../game

# Disable telemetry and build optimized Next.js production bundle
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/next start -p ${PORT:-3000}"]
