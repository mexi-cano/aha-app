# ITS AHA post-pilot product roadmap

This document records intentionally deferred product and architecture work. It
is not v1 scope and does not override `docs/aha-replit-master-spec.md`. Future
increments must update the master specification before implementation.

## Multi-crew data boundary

- Replace the single shared backup namespace with server-issued organization
  and crew scope. Access tokens must carry opaque scope identifiers, and every
  job, AHA, PDF, history lookup, and write must enforce that scope on the
  server. Client-side filtering is not a security boundary.
- Add organization, crew, and job-assignment data through reviewed additive
  migrations. Decide whether jobs are crew-owned or assigned to multiple crews
  from ITS operating practice before defining the schema.
- Partition local IndexedDB data by authorized scope. `Change crew` must be an
  explicit code-authorized transition and must never merge or expose another
  crew's locally cached records.
- Prove cross-crew isolation for list, restore, direct-ID access, offline cache,
  backup queues, PDFs, and historical downloads before enabling a second code.

## Job lifecycle and long-running recovery

- Add Active, Closed, and Archived lifecycle states without deleting historical
  AHAs or PDF evidence. Closing or archiving changes discovery only.
- Return scoped job summaries with recent activity so active/recent jobs can be
  prioritized. Provide search and an explicit older-jobs view rather than
  restoring a company's entire history by default.
- Restore active job data first, then history metadata. Download older PDF bytes
  only when opened unless ITS adopts an offline-retention requirement.
- Define retention and storage-capacity policy with ITS legal, insurance, and
  safety stakeholders before any evidence expiration or compression work.

## Approved site profiles and location assistance

- Evaluate an organization-scoped directory of ITS-approved sites, emergency
  centres, contact instructions, and muster points only after multi-crew scope
  is server-enforced. Shared recent-value suggestions must never cross a crew or
  organization boundary merely because a device has cached them.
- Treat address autocomplete and device geolocation as optional, user-initiated
  helpers. Manual entry and offline completion must remain available, and every
  proposed result must be confirmed before it changes an AHA or job default.
- Select a provider only after reviewing billing, attribution, privacy, and
  permanent-storage rights for values retained in IndexedDB, Neon, and safety
  evidence. Keep provider credentials behind a rate-limited server proxy.
- Never infer the operationally appropriate emergency centre from geographic
  proximity. ITS's site emergency plan remains authoritative.

## Company and supervisor experience

- Treat company-wide safety review, exports, approvals, and notifications as a
  separate supervisor experience with its own authorization model. Do not reuse
  a field crew's shared code as administrative access.
- Validate crew reassignment, shared jobs, overnight work, inactive crews, and
  device replacement with ITS before choosing roles, permissions, or workflow
  terminology.
