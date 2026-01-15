# Multi-stage Dockerfile for Fly.io (and general production) deployments

# Stage 1: Build dependencies + Prisma client
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Prisma schema must exist before npm ci runs postinstall (prisma generate)
COPY prisma ./prisma

# Install all deps (Prisma CLI is a devDependency, used only at build time)
RUN npm ci \
  && npm cache clean --force

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Remove dev deps for a smaller runtime image, while keeping generated Prisma artifacts
RUN npm prune --omit=dev


# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Proper signal handling (Fly sends SIGINT/SIGTERM during deploys)
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=3000

# Copy pruned node_modules + app code
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated

# Copy the rest of the runtime source
COPY . .

# Ensure uploads directory exists (ephemeral unless you mount a volume)
RUN mkdir -p /app/uploads

# Container healthcheck (Fly also does its own health checks)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (r) => { if (r.statusCode !== 200) process.exit(1); }).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.cjs"]

EXPOSE 3000
