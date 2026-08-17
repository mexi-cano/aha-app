---
name: Exact-pin catalog duplicates
description: Pinning the pnpm catalog exact can fork type/tooling deps into duplicates
---

Rule: when pinning the pnpm catalog to exact versions, pin to the versions the lockfile has already resolved, not the base of the old range.

**Why:** other workspace deps pull newer patch versions of shared type/tooling packages; an older exact catalog pin then coexists with the newer copy, producing duplicate type instances and confusing type errors in unrelated packages.

**How to apply:** after changing catalog pins, run install plus a full workspace typecheck; if duplicate-instance errors appear, bump the catalog entry to the newer already-resolved version.
