# Base44 Dev Environment — Zephyx Mail

## Stack
pnpm monorepo (Node 24, pnpm 11.21.0):
- `artifacts/novamail-web` — React 19 + Vite 7 frontend (the preview entry point, port 3000)
- `artifacts/api-server` — Express 5 + Prisma 7 + Drizzle API (port 5000)
- `lib/*` — workspace packages (db, api-zod, api-client-react, api-spec) consumed as source TS
- Postgres 16 + Redis 7.4 as compose infra

## How it runs here (docker-compose.base44.yml)
Single-origin wiring: the Vite dev server listens on host port 3000 and proxies `/api` to the
`api` service (`http://api:5000`) via `API_PROXY_TARGET`. This keeps cookie/session auth same-origin.
The API runs with `NODE_ENV=development`, which skips `validateProductionSecrets` (no https URLs,
no strict origin allowlist, dev allows any CORS origin). The API/worker/scheduler run via `tsx watch`
for live reload; the frontend uses Vite HMR.

A one-shot `setup` service runs `pnpm install --frozen-lockfile`, `prisma generate`, and
`prisma migrate deploy` before the app services start. All app services share the bind-mounted repo
and a shared `pnpm_store` volume, so `node_modules` installed by `setup` are reused.

## Credentials
No external-service secrets are required to boot. `.env.base44-defaults` (repo, listed FIRST in
`env_file`) holds local-only placeholders: generated JWT/session signing keys and Postgres/Redis
creds for the compose services. Optional integrations (Gmail OAuth, SMTP, Gemini AI, object storage)
are gated by feature flags that default off; if you want them, add the real keys via the Base44
secrets UI — they land in `/run/base44/app.env` (listed LAST in `env_file`) and override the defaults.

## Verify it works
- `docker compose -f docker-compose.base44.yml ps` — setup exited 0, others up
- `curl -sf http://localhost:3000/` — Vite serves the app
- `curl -sf http://localhost:5000/api/health/live` — API health
- Preview should show the login/register screen

## Notes / quirks
- The repo's own `docker-compose.yml` builds production images (baked source) — do NOT use it for
  edits; use `docker-compose.base44.yml`.
- `vite.config.ts` proxy target was made env-configurable (`API_PROXY_TARGET`) so the dev container
  can route to the `api` service instead of `127.0.0.1:3000`.
- Prisma client is generated into `artifacts/api-server/src/generated/prisma` (committed); `setup`
  regenerates it to match the installed Prisma version.
- Lib packages export raw `.ts` (`exports` → `./src/index.ts`); `tsx` and Vite transpile them
  on the fly, so no separate lib build is needed in dev.
