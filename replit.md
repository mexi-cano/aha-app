# ITS AHA

Mobile-first PWA for construction crews to complete their daily Activity Hazard Analysis (AHA) with finger signatures and PDF output.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/client run dev` — run the client (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — external **Neon** Postgres connection string (in Secrets)

## Stack

- pnpm workspaces, TypeScript 5.9; Node pinned to 22 via `.nvmrc` + `engines` (Replit runtime is 24 — treat 22 as the deploy/policy target)
- Client: Vite + React 19, react-router 7, Tailwind v4, vite-plugin-pwa, Dexie (offline), signature_pad, @cantoo/pdf-lib
- API: Express 5 + helmet + express-rate-limit
- DB: external Neon Postgres via `@neondatabase/serverless` (drizzle-orm `neon-http` driver) — **not** Replit Postgres
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

- Client app: `artifacts/client/src/` — stubs `pdf/`, `screens/`, `data/` for later phases
- Server routes: `artifacts/api-server/src/routes/` (mounted under `/api`)
- DB access: `lib/db` (schema in `lib/db/src/schema.ts`)
- API contract source of truth: `lib/api-spec/openapi.yaml`
- Master product spec: `docs/aha-replit-master-spec.md` (canonical strings in §3 are verbatim-only; §10 lists v1 exclusions)
- Agent guardrails: `AGENTS.md` (repo root)
- Static assets: `assets/`

## Architecture decisions

- Database is external Neon, wired only through `DATABASE_URL`; do not provision Replit Postgres
- `GET /api/health` proves DB connectivity with `select 1`; `GET /api/healthz` is app-only liveness
- Exact dependency pins everywhere (no `^`/`~`, including the pnpm catalog); lockfile committed
- react-router v7 (not wouter) for client routing

## Product

- Skeleton only so far: placeholder page showing server + database health. Screens, auth gate, and PDF engine come in later phases.

## User preferences

- Exact-pinned dependencies only; new deps need PR justification; upgrades as dedicated PRs
- No state-management or auth frameworks, no ORM substitutions, no CDN assets

## Gotchas

- Catalog pins are exact: when adding a dep that peers on react/vite/@types, keep catalog versions aligned or pnpm creates duplicate type instances and typecheck fails
- `pnpm-workspace.yaml` has `minimumReleaseAge: 1440` — brand-new package releases (<1 day old) will fail to install; do not disable this
- Never edit `.replit` or workflows; Vite config must keep `allowedHosts: true` and read `PORT`/`BASE_PATH` from env

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
