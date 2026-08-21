# Phase 4 production operations

Phase 4 keeps Dexie authoritative on each iPad. Neon is an automatic backup
target and a source for an explicit empty-device restore; it is not a
multi-device collaboration or automatic pull service.

## Environments and secrets

Use separate Neon projects/branches for preview validation and permanent
production. The controlled pilot is the first rollout stage of production, not
a disposable database: every real pilot AHA remains in the same production
database when access expands. Never copy preview fixtures into production, and
never point the managed schema-push hook at production. Keep these environments
separate:

- Replit Project Editor and preview testing: `its-aha-preview`
- Published app, beginning with the controlled pilot: `its-aha-production`

Configure these Replit Secrets independently in each environment:

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
four application tables (`jobs`, `ahas`, `aha_pdfs`, and
`aha_pdf_revisions`) and exercise backup/restore before pilot approval. If
preview data must be retained, create an isolated Neon branch before running
evidence-version tests; otherwise use the existing `its-aha-preview` project.

Before a production migration, create a Neon recovery point or isolated
recovery branch. Keep the Replit Project Editor connected to preview. To
migrate production without replacing the preview connection, add a temporary
Project Editor secret named `PRODUCTION_DATABASE_URL`, run both verified
migration passes, and then remove that temporary secret:

```sh
DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm --filter @workspace/db run migrate
DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm --filter @workspace/db run migrate
```

Set the published app's `DATABASE_URL` secret to the permanent production
connection string, deploy merged `main`, and run the smoke test. Later rollout
stages keep this database and require no pilot-to-production data migration.
Do not use `push` against production.

The repository-owned `migrate` runner resolves the checked-in migration folder
from its own module location rather than the shell working directory. It exits
successfully only after verifying that the non-empty journal is represented in
`drizzle.__drizzle_migrations` and that `jobs`, `ahas`, `aha_pdfs`, and
`aha_pdf_revisions` exist.
Treat any other result as a failed migration; do not rely on a CLI success
message without this verification.

## PDF evidence storage review

Run this read-only query monthly during the ITS pilot. Keep the result with the
release operations record, and configure capacity alerts using the subscribed
Neon plan's storage limits. Do not automatically delete evidence before ITS
adopts a legal and insurance retention policy.

```sql
select
  'current' as storage_class,
  count(*) as pdf_count,
  coalesce(sum(byte_length), 0) as total_bytes,
  coalesce(avg(byte_length), 0)::bigint as average_bytes,
  coalesce(max(byte_length), 0) as maximum_bytes
from aha_pdfs
union all
select
  'superseded' as storage_class,
  count(*) as pdf_count,
  coalesce(sum(byte_length), 0) as total_bytes,
  coalesce(avg(byte_length), 0)::bigint as average_bytes,
  coalesce(max(byte_length), 0) as maximum_bytes
from aha_pdf_revisions;
```

Preview evidence validation must prove, in order: current upload; newer upload
with prior-current archival; older out-of-order upload; exact retry; checksum
conflict returning 409 without a row change; current/history metadata listing;
exact historical download; and empty-device restore with lazy historical-byte
download. Run the checked-in migration a second time after this test. Do not
connect a local or preview build to `its-aha-production`.

## Production recovery points

Enable the longest practical Neon point-in-time recovery window and scheduled
snapshots available for the production plan. Capture a recovery point after the
verified migrations and another after the production smoke test. Prove recovery
by restoring to an isolated verification branch; never overwrite the active
production branch merely to test the procedure. Record the result without
including connection strings, access codes, tokens, PDF bytes, or AHA payloads.

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
- current/history PDF counts, newer and out-of-order uploads, idempotent retry,
  integrity-conflict rollback, exact historical download, and lazy restore;
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
- Replit preview/permanent-production separation, controlled-pilot smoke output,
  CodeRabbit findings resolved or dispositioned, and the two expected non-fatal
  client-build warnings.

Issue #8 is the Phase 4 exit gate. The eight full product scenarios remain the
separate release-candidate gate in issue #9.
