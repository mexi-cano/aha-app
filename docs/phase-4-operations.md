# Phase 4 production operations

Phase 4 keeps Dexie authoritative on each iPad. Neon is an automatic backup
target and a source for an explicit empty-device restore; it is not a
multi-device collaboration or automatic pull service.

## Environments and secrets

Use separate Neon branches/databases for preview validation and the controlled
pilot. Never point the managed schema-push hook at the pilot database. Configure
these Replit Secrets independently in each environment:

- `DATABASE_URL` — that environment's external Neon connection string
- `ACCESS_CODE_HASH` — output of `pnpm --filter @workspace/scripts run generate:access-code-hash`
- `AUTH_TOKEN_SECRET` — output of `pnpm --filter @workspace/scripts run generate:auth-token-secret`

The access-code command reads interactively without echoing the code. Neither
secret belongs in shell history, logs, issue comments, screenshots, or Git.
Rotating `ACCESS_CODE_HASH` immediately invalidates issued device tokens.

## Checked-in migration procedure

Generate and review schema changes without connecting to a database:

```sh
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run validate:migrations
```

For preview, set `DATABASE_URL` to the disposable preview branch and run:

```sh
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/db run migrate
```

The second run validates the already-migrated/idempotent state. Inspect the
three tables and exercise backup/restore before pilot approval. After the Phase
4 PR merges, a human operator sets `DATABASE_URL` to the pilot branch, applies
the same checked-in migration once, deploys merged `main`, and runs the smoke
test. Do not use `push` against pilot or production.

The repository-owned `migrate` runner resolves the checked-in migration folder
from its own module location rather than the shell working directory. It exits
successfully only after verifying that the non-empty journal is represented in
`drizzle.__drizzle_migrations` and that `jobs`, `ahas`, and `aha_pdfs` exist.
Treat any other result as a failed migration; do not rely on a CLI success
message without this verification.

## Repository validation

Use repository Node 22 and the committed pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm test
pnpm --filter @workspace/client run build
pnpm --filter @workspace/scripts run validate:pwa
pnpm --filter @workspace/api-server run build
pnpm audit --prod
git diff --check
```

The PWA validator asserts unique precaching of the app shell, bundled fonts,
logo, Energy Wheel, and code-split PDF renderer; network-only `/api` handling;
obsolete-cache cleanup; and prompt-only service-worker activation.

## Issue #8 / PR evidence checklist

Record evidence, not secrets or payloads, for:

- migration generation, preview first migration, and second no-op migration;
- wrong/right access code, five-failure rate limit, token tamper/expiry, and
  immediate invalidation after access-code rotation;
- offline job/AHA/PDF queueing, reconnect processing, interruption/retry, 401
  pause, offline dismissal, reauthorization, and a retained support conflict;
- empty-iPad selected-job restore, PDF checksum verification, termination and
  resume, and explicit active-job selection;
- two successive PWA deployments, waiting update UI, editor/signature deferral,
  Home acceptance, stale-cache recovery, and preservation of all local state;
- 393 px and 834 px layout, keyboard/focus behavior, 48 px targets, Add to Home
  Screen airplane-mode completion, and physical iPad termination tests;
- Replit preview/pilot environment separation, production smoke output,
  CodeRabbit findings resolved or dispositioned, and the two expected non-fatal
  client-build warnings.

Issue #8 is the Phase 4 exit gate. The eight full product scenarios remain the
separate release-candidate gate in issue #9.
