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

The repository contract remains pinned to Node 22. Replit's platform-managed `.replit` currently selects `nodejs-24`; the frozen install, typecheck, smoke test, and production builds also passed under Node 24.19.0 as a forward-compatibility check (with the expected engine warning).

`pnpm audit --prod` reports no known vulnerabilities. The full development audit reports four high and one low advisory through existing transitive build/codegen tooling (Workbox/AJV, Orval, PostCSS/Vite, and esbuild). PR 0 does not mix in dependency upgrades; resolve those findings in a dedicated dependency-security PR.

## Live Replit handoff check

These checks require the Replit workspace and its secret store, so they remain a post-push verification:

- [ ] Pull the PR branch into Replit and let the frozen install complete.
- [ ] Click **Run** and confirm the client preview loads without changing Replit configuration.
- [ ] Confirm `GET /api/healthz` returns `{ "status": "ok" }`.
- [ ] Confirm the health screen still reports Client, Server, and Database as OK using the configured `DATABASE_URL` secret.
