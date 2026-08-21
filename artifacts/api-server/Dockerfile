# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig*.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install all workspace deps
RUN pnpm install --frozen-lockfile

# Build libs and api-server
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Install only production deps
RUN pnpm install --frozen-lockfile --prod

# Copy built output
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
