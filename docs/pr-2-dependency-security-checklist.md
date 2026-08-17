# PR 2 — Dependency Security and Replit Runtime Recovery

PR 2 closes the development-only advisory register from PR 0 and restores the
Replit Run workflow. It is a dedicated infrastructure and dependency change;
Phase 1 product work begins only after this PR is merged and verified in
Replit.

## Scope guard

- [x] Keep Node 22 and pnpm 11.19.0 as the repository policy toolchain.
- [x] Add no new dependency and make no application, API, OpenAPI, or database
  schema change.
- [x] Leave `.replit`, Replit workflow files, `scripts/post-merge.sh`, and
  `server.allowedHosts: true` unchanged.
- [x] Preserve the PR 0 checklist as the historical finding record.

## Replit Run recovery

The captured Replit failure repeatedly invoked
`pnpm add pnpm@11.19.0` until Node could no longer create threads and aborted.
Replit's bundled pnpm 10.26.1 was reading the root `packageManager` declaration
and recursively trying to switch itself to pnpm 11.19.0. The reported
`pthread_create` and CA-certificate loading errors were consequences of that
resource exhaustion, not application, TLS, or Neon failures.

- [x] Add `manage-package-manager-versions=false` to the existing root
  `.npmrc`. pnpm 10 reads this setting and runs directly; pnpm 11 remains pinned
  for the policy toolchain.
- [x] Retain all Node 22 and pnpm 11.19.0 declarations.
- [x] Document Replit's expected Node 24 engine warning in `replit.md`.
- [x] In Replit, confirm Run no longer invokes `pnpm add pnpm@11.19.0` or emits
  `pthread_create`, CA-loading, or `SIGABRT` failures.

## Advisory closure

Owner: repository maintainer (Carlos Cano), with Codex implementation support.
Deadline: merge this PR before Phase 1 and before any release.

| Advisory | Vulnerable resolution | Patched resolution | Remediation and scope |
| --- | --- | --- | --- |
| `GHSA-g7r4-m6w7-qqqr` | `esbuild@0.27.3` | `esbuild@0.28.1` | Upgrade the API server's direct pin and the existing workspace-wide override. This remains build and code-generation tooling. |
| `GHSA-7p8r-x3mc-p8w7` | `fast-uri@3.1.4` | `fast-uri@3.1.5` | Override only the vulnerable version used by AJV in Workbox and Orval/Scalar build paths. |
| `GHSA-rgw5-rvv9-x895` | `brace-expansion@5.0.8` | `brace-expansion@5.0.9` | Override only the vulnerable 5.0.8 resolution used by build/codegen globbing; preserve the separate 2.x dependency branch. |
| `GHSA-5p4m-2wfm-xmqj` | `js-yaml@4.3.0` | `js-yaml@4.3.1` | Upgrade Orval from 8.23.0 to 8.24.0 so the generator's own dependency is patched without a global override. |
| `GHSA-2v37-7h3g-55p8` | `nanoid@3.3.16` | `nanoid@3.3.18` | Override only the vulnerable PostCSS resolution used by Vite/Tailwind builds. |

The three transitive overrides use exact vulnerable-version selectors instead
of broad package-name overrides. This keeps unrelated major-version branches
and future patched resolutions under their owning packages' normal ranges.

`esbuild-plugin-pino@2.3.3` is retained because it is the latest published
version and creates the worker bundles required by the API's Pino logging.
Its declared esbuild peer ceiling is stale and was already exceeded by the
previous `esbuild@0.27.3` override. Compatibility with 0.28.1 must therefore be
proved by the API production build, worker-artifact inspection, and a running
`/api/healthz` request with request logging.

## Generated API verification

- [x] Regenerate both Orval targets with 8.24.0.
- [x] Confirm that all six generated-source changes are generator header
  comments only.
- [x] Confirm the OpenAPI document and generated API/schema behavior are
  unchanged.
- [x] Run code generation a second time and confirm it is idempotent.

## Automated verification

### Policy toolchain — Node 22.23.2 and pnpm 11.19.0

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm --filter @workspace/api-spec run codegen` twice with no second-run
  diff
- [x] `pnpm run typecheck`
- [x] `pnpm test`
- [x] `pnpm run build`
- [x] Run the executable worker-artifact check below; all four required bundles
  are non-empty and pass Node's syntax check.

  ```sh
  for worker_bundle in pino-worker.mjs pino-file.mjs pino-pretty.mjs thread-stream-worker.mjs; do
    test -s "artifacts/api-server/dist/$worker_bundle" && node --check "artifacts/api-server/dist/$worker_bundle"
  done
  ```

- [x] Start the built API; verify `GET /api/healthz` returns `{"status":"ok"}`
  and Pino's configured development transport loads and records the request.
- [x] `pnpm audit` reports no known vulnerabilities.
- [x] `pnpm audit --prod` reports no known vulnerabilities.
- [x] Exact-pin, generated-code, scope, and whitespace audits pass.

### Local Replit-path emulation — Node 24.19.0 and pnpm 10.26.1

- [x] `pnpm --version` remains 10.26.1 without trying to install pnpm 11.
- [x] Frozen install, code generation, typecheck, tests, build, and audit pass.
- [x] Client development server starts and serves HTML.
- [x] API development workflow builds, starts, returns `{"status":"ok"}` from
  `/api/healthz`, and logs the request through Pino.

The expected Node 24 engine warning and the pre-existing non-fatal Vite tooltip
sourcemap warning do not fail this matrix. Any new warning or error does.

## Live Replit acceptance

- [x] Pull the PR branch into Replit and let the frozen install complete.
- [x] Click **Run** and confirm both workflows remain running without package
  manager recursion or resource-exhaustion errors.
- [x] Confirm the client preview loads.
- [x] Confirm `GET /api/healthz` returns `{"status":"ok"}`.
- [x] Confirm the system screen still reports server and external Neon database
  connectivity using the existing `DATABASE_URL` secret.

The repository maintainer completed this live check in Replit on 2026-08-17
under Node 24.12.0 and pnpm 10.26.1. The expected Node 22 engine warnings were
present; package-manager recursion and resource-exhaustion errors were absent.
