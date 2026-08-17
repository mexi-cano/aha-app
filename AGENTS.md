# AGENTS.md — ITS AHA App

Operating rules for any agent (human or AI) working in this repository. Read this before making changes.

## Non-negotiable product rules

- All product rules live in **`/docs/aha-replit-master-spec.md`** and are **non-negotiable** — especially:
  - **§3 (Canonical form data):** verbatim strings only. Never paraphrase, reword, deduplicate, or invent example strings, the worker acknowledgment, or the safety gate question.
  - **§10 (v1 exclusions):** do NOT build anything on that list.

## Operational rules

- The server binds `0.0.0.0` and reads `PORT` from the environment.
- **Never modify `.replit` or workflow files.** Workflows are managed by the platform.
- The Vite dev config must keep the Replit dev host allowed (`server.allowedHosts: true` in `artifacts/client/vite.config.ts`). Do not remove it.
- **Fonts are bundled locally in the repo. No font CDNs, no CDN assets of any kind** (offline requirement).

## Workspace map

This is a **pnpm monorepo** (not a plain /client + /server layout):

| Role | Location |
| --- | --- |
| Client (Vite + React + TS, PWA) | `artifacts/client/` — app code in `artifacts/client/src/` (`pdf/`, `screens/`, `data/` stubs for later phases) |
| Server (Express + TS) | `artifacts/api-server/` — routes in `src/routes/`, served under `/api` |
| Database access | `lib/db/` → external **Neon** Postgres via `DATABASE_URL` (Secrets), using drizzle-orm + drizzle-kit with the `@neondatabase/serverless` driver |
| API contract | `lib/api-spec/openapi.yaml` (source of truth) → codegen: `pnpm --filter @workspace/api-spec run codegen` → Zod schemas (`lib/api-zod`) + React Query hooks (`lib/api-client-react`) |
| Docs | `docs/` (master spec: `docs/aha-replit-master-spec.md`) |
| Static assets | `assets/` (repo root) |

- Node is pinned to 22 (`.nvmrc`, `engines`).
- Full typecheck: `pnpm run typecheck` at the repo root.

## Dependency policy

- **Exact pins only** — no `^` or `~` ranges, anywhere (including the catalog in `pnpm-workspace.yaml`). The pnpm lockfile is committed.
- **No new dependencies without justification in the PR description.**
- **Upgrades only as dedicated PRs** — never mixed into feature work.
- **No state-management frameworks** (Redux, Zustand, MobX, etc.).
- **No auth frameworks** — auth is the spec's simple access-code gate, built by hand per §1.
- **No ORM substitutions** — drizzle-orm only.
- **No CDN assets** — everything ships from the repo.
