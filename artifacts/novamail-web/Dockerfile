# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig*.json ./
COPY lib/ ./lib/
COPY artifacts/novamail-web/ ./artifacts/novamail-web/

RUN pnpm install --frozen-lockfile

# Build the Vite app (needs PORT + BASE_PATH at build time)
ENV PORT=3000
ENV BASE_PATH=/

RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/novamail-web run build

# ── Production stage (nginx) ──────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/artifacts/novamail-web/dist/public /usr/share/nginx/html

# SPA routing: serve index.html for all routes
COPY artifacts/novamail-web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
