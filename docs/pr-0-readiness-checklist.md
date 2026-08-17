# PR 0 — Repository Readiness Checklist

PR 0 makes the Replit-created skeleton reproducible and gives Phase 1 a stable starting point. It does not implement product features.

## Scope guard

- [x] Read `AGENTS.md`, the Codex handoff, and the v1.2 master spec before changing code.
- [x] Do not modify `.replit` or Replit workflow files.
- [x] Keep `server.allowedHosts: true` in the client Vite config.
- [x] Do not add or upgrade dependencies in this PR.
- [x] Do not begin any v1-excluded feature.

## Documentation and product contract

- [x] Correct the binding master-spec label and content to v1.2.
- [x] Add the Codex handoff and make the spec/handoff precedence explicit.
- [x] Clarify that TanStack Query is limited to remote API state; Dexie owns local AHA editor state.
- [x] Remove the stale Phase 4 instruction about nonexistent session middleware.

## Runtime and dependency reproducibility

- [x] Pin the repository package manager.
- [x] Replace pnpm's removed `onlyBuiltDependencies` setting with `allowBuilds`.
- [x] Restore platform-native optional packages needed by Vite/Rollup, Tailwind, Lightning CSS, and esbuild.
- [x] Remove all remaining semver ranges from package manifests.
- [x] Make the Express listener explicitly bind `0.0.0.0` and continue reading `PORT` from the environment.
- [x] Regenerate the tracked pnpm lockfile with the pinned pnpm version.

## Required local assets

- [x] Bundle Barlow Medium (500), SemiBold (600), and Bold (700), plus the font license.
- [x] Load Barlow from repository files only; add no CDN references.
- [x] Make the PDF template generator use repository-relative paths.
- [x] Generate and visually verify `assets/aha-clean-template-blank.pdf`.

## Automated verification

- [x] Add a dependency-free server health smoke test.
- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm run typecheck`
- [x] `pnpm test`
- [x] `pnpm run build`
- [x] Record `pnpm audit` results.
- [x] Exact-pin audit finds no `^` or `~` dependency ranges.
- [x] CDN audit finds no production font or asset references.
- [x] Confirm `.replit`, workflows, and `server.allowedHosts: true` remain unchanged.

The repository contract remains pinned to Node 22. The frozen install, full monorepo typecheck, smoke/unit test suite, and production build all passed under Node 22.23.2 with pnpm 11.19.0. Replit's platform-managed `.replit` currently selects `nodejs-24`; the same suite also passed under Node 24.19.0 as a forward-compatibility check (with the expected engine warning).

`pnpm audit --prod` reports no known vulnerabilities. The full development audit reports four high and one low advisory through existing transitive build/codegen tooling. None is reachable from an application request or other untrusted runtime input in the current repository workflows; the detailed assessment is below.

### Development advisory register

Owner: repository maintainer (Carlos Cano), with Codex implementation support. Deadline: merge a dedicated dependency-security PR before Phase 1 feature work begins and, in all cases, before any release. PR 0 does not mix dependency upgrades into repository-readiness work.

| Advisory and locked version | Affected workspace dependency paths | Untrusted-input reachability |
| --- | --- | --- |
| `GHSA-g7r4-m6w7-qqqr` — `esbuild@0.27.3` (low) | `artifacts/api-server` directly and through `esbuild-plugin-pino`; `artifacts/client` through `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite`, and `vite-plugin-pwa` Vite/tsx branches; `artifacts/mockup-sandbox` through `@tailwindcss/vite`, `@vitejs/plugin-react`, and `vite` Vite/tsx branches; `lib/api-spec` through Orval's `@orval/*` generator packages; `lib/db` through `drizzle-kit` and its tsx branch; `scripts` through `tsx` | Build, test, and code-generation tooling only. The advisory concerns the esbuild development server on Windows; this project runs on macOS/Replit Linux and does not expose that server as a production route. |
| `GHSA-7p8r-x3mc-p8w7` — `fast-uri@3.1.4` (high) | `artifacts/client > vite-plugin-pwa > workbox-build > @apideck/better-ajv-errors > ajv`; `artifacts/client > vite-plugin-pwa > workbox-build > ajv`; `lib/api-spec > orval > @scalar/openapi-parser > {ajv, ajv-draft-04 > ajv, ajv-formats > ajv}` | Workbox validates repository-controlled PWA build inputs; Orval/Scalar parses the checked-in `lib/api-spec/openapi.yaml`. No application request reaches these code paths. |
| `GHSA-rgw5-rvv9-x895` — `brace-expansion@5.0.8` (high) | `artifacts/client > vite-plugin-pwa > workbox-build > glob > minimatch`; `lib/api-spec > orval > @orval/{angular,axios,core,effect,fetch,hono,mcp,mock,query,solid-start,swr,zod} > typedoc > minimatch`; plus Orval's direct `typedoc`, `typedoc-plugin-coverage`, and `typedoc-plugin-markdown` TypeDoc branches | Workbox globbing and Orval/TypeDoc use repository-owned configuration and file patterns during build/codegen. No runtime or untrusted-request path exists. |
| `GHSA-5p4m-2wfm-xmqj` — `js-yaml@4.3.0` (high) | `lib/api-spec > orval > js-yaml` | Orval parses the checked-in local OpenAPI document during code generation; the current workflow accepts no uploaded or runtime YAML. |
| `GHSA-2v37-7h3g-55p8` — `nanoid@3.3.16` (high) | `artifacts/client` through `@tailwindcss/vite`, `@vitejs/plugin-react`, `vite`, and `vite-plugin-pwa`, each via `vite > postcss`; `artifacts/mockup-sandbox` through `@tailwindcss/vite`, `@vitejs/plugin-react`, and `vite`, each via `vite > postcss` | PostCSS processes checked-in CSS during Vite builds. No application request or other untrusted runtime input invokes this package. |

## Live Replit handoff check

These checks require the Replit workspace and its secret store, so they remain a post-push verification:

- [ ] Pull the PR branch into Replit and let the frozen install complete.
- [ ] Click **Run** and confirm the client preview loads without changing Replit configuration.
- [ ] Confirm `GET /api/healthz` returns `{ "status": "ok" }`.
- [ ] Confirm the health screen still reports Client, Server, and Database as OK using the configured `DATABASE_URL` secret.
