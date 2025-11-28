# Multi-stage Dockerfile for Scrabble Backend

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Copy application code
COPY . .

# Create upload directory
RUN mkdir -p /app/uploads

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run with dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.cjs"]

EXPOSE 3000
