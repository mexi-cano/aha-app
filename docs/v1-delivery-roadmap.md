# ITS AHA v1 delivery roadmap

This roadmap makes the complete v1 commitment visible without copying product
requirements into a second source of truth. `AGENTS.md` and
`docs/aha-replit-master-spec.md` remain binding; the phase definitions below
point back to master-spec §§7–11.

## Delivery governance

- All work is tracked under the GitHub `v1-pilot` milestone and its parent v1
  delivery issue.
- Each phase has one linked delivery issue and one focused pull request. GitHub
  assigns pull-request numbers when they are opened; phase names, not predicted
  PR numbers, are the stable identifiers.
- A phase issue closes only after its implementation PR is merged and all
  required automated, Replit, physical-iPad, and review evidence is recorded.
  Verified findings must be resolved or have a documented stale-finding
  rationale, followed by rerun validation.
- Deferred phase work is still required v1 scope. Starting a later phase does
  not waive an earlier exit gate.
- The parent delivery issue closes only after all eight master-spec §11
  scenarios pass end to end and no blocking issue remains open.

## GitHub tracking

- Milestone: [`v1-pilot`](https://github.com/mexi-cano/aha-app/milestone/1)
- Parent delivery gate: [#4](https://github.com/mexi-cano/aha-app/issues/4)
- Phase 1 — Local drafting: [#5](https://github.com/mexi-cano/aha-app/issues/5)
- Phase 2 — Energy, Review, and Signing: [#6](https://github.com/mexi-cano/aha-app/issues/6)
- Phase 3 — Exact PDF and Completed workflow: [#7](https://github.com/mexi-cano/aha-app/issues/7)
- Phase 4 — Setup, backend sync, auth, and PWA hardening: [#8](https://github.com/mexi-cano/aha-app/issues/8)
- Final v1 acceptance: [#9](https://github.com/mexi-cano/aha-app/issues/9)

## Delivery matrix

| Delivery                                               | Binding scope                                                                                                                                               | Exit gate                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 — Local drafting                               | Master spec §9 Phase 1: shared domain model, IndexedDB, autosave, Home, Details, Work, copy-forward, prefill choice, and crash recovery                     | Local/offline drafting and recovery pass automated, Replit, and iPad checks                                                            |
| Phase 2 — Energy, Review, and Signing                  | Master spec §§3–6 and §9 Phase 2: Energy selection and gate, three-tier Review, crew editing, and complete Signing Mode                                     | Review rules, all signature cases, and pass-the-device behavior pass on a physical iPad                                                |
| Phase 3 — PDF and Completed workflow                   | Master spec §§4, 6, 7, and §9 Phase 3: one-to-one PDF port, visual-diff route, Completed workflow, late arrivals, and post-completion updates               | Generated PDF is visually indistinguishable from the official reference and update/signature rules pass                                |
| Phase 4 — Setup, backend sync, auth, and PWA hardening | Master spec §§1, 4, 6, 8, and §9 Phase 4: first-run setup, access-code gate, Neon backup/sync, installability, offline launch, and service-worker lifecycle | Production setup, cold offline launch, reconnect, service-worker update, stale-cache prevention, and backup pass in Replit and on iPad |
| v1 release gate                                        | Master spec §11                                                                                                                                             | All eight scenarios pass; release blockers are zero; evidence is linked from the parent issue                                          |

## Required acceptance evidence

Every phase issue and PR records:

1. Automated evidence: frozen install, deterministic code generation when
   affected, full typecheck, tests, production builds, and dependency audits.
2. Replit evidence: supported compatibility warnings only, app startup,
   `/api/healthz`, feature-specific interaction checks, and persistence across
   a restart.
3. Physical-iPad evidence: Safari viewport, keyboard, focus, scrolling, dialogs,
   48-pixel touch targets, and phase-specific offline or signature checks.
4. Review evidence: verified CodeRabbit findings, the resulting changes or
   reasons for skipping stale findings, and the rerun validation.

## Phase 1 acceptance checklist

- [ ] One tap creates at most one AHA for the active job and local date.
- [ ] First-day creation is blank; later creation deep-copies the most recent
      saved AHA across weekends or date gaps, assigns the active local date to
      the new AHA, and leaves the source AHA unchanged.
- [ ] Copy-forward preserves the header (including rescue-plan choice),
      description, tasks, meeting notes, Energy categories and examples, and
      crew roster/worker identities while resetting signatures, daily N/A
      choices, safety check, completion state, and backup state.
- [ ] Home accurately renders not-started, draft, signing-in-progress, and
      completed records without dead controls.
- [ ] Details and Work match the approved visual system at 834 px and 393 px;
      all active controls meet the master-spec type and touch-target minimums.
- [ ] Rapid typing, internal navigation, app hiding, hard reload, and relaunch
      persist and recover the latest user input, including edits made while
      autosave is pending; `Saved` appears only after IndexedDB confirms it.
- [ ] IndexedDB failure remains visible and retryable; the app never reports a
      failed write as saved and never deletes unreadable data.
- [ ] Both start-blank paths work: immediate before edits and confirmed after
      edits.
- [ ] A 16th task is rejected with a clear message and no data loss.
- [ ] Replit and physical-iPad acceptance evidence is attached to the Phase 1
      issue before it closes.

## Final v1 acceptance gate

Run all eight master-spec §11 scenarios against the release candidate. Keep the
release blocked until offline completion and PDF generation, worker absence,
read-only signing review, late arrival, post-completion updates, crash recovery,
reconnect backup, graceful limits, and official-form visual parity all pass.
