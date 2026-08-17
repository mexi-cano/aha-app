# ITS AHA App — Project Handoff for Codex

**Audience:** the coding agent (Codex) executing build phases on this repository.
**Precedence:** if anything here conflicts with `/docs/aha-replit-master-spec.md` (v1.2) or `AGENTS.md`, those win. This file is context, not new rules.

---

## What this is

A mobile-first PWA that lets a construction crew lead (the pilot user: a foreman named Cesar) complete his company's mandatory daily Activity Hazard Analysis (AHA) on an iPad, collect 5–10 finger signatures from his crew, and produce a PDF that exactly matches the official ITS company form (IS_F_222_EN.2203). The app's UI is modern and touch-first; the PDF output replicates the official two-page sheet precisely, including highlighter-style marks. Every product decision was validated with the actual end user and against the actual paper form before any code existed.

## Where the project stands

- **Done:** full discovery; six approved high-fidelity numbered designs plus a phone variant in `/assets/design/`; a working Python reference implementation of the PDF (`/assets/aha-clean-template.py`) with verified output (`/assets/aha-clean-filled-sample.pdf`); the master spec; and a verified project skeleton built in Replit (client + Express server + external Neon Postgres, health check passing end-to-end).
- **Now:** feature phases 1–4 per spec §9, executed by Codex as one PR per phase, reviewed and merged by the human, run and visually verified in Replit.
- **Not yet started:** everything in spec §9 beyond the skeleton.

The `.dc.html` files are interactive design references, not production assets. They load remote tooling/fonts to render the design canvas; never copy those CDN references into the PWA. The production app bundles all runtime assets locally.

## Decision history (settled — do not re-litigate)

1. **Exact official output.** The company is standardized on this sheet. The PDF layout, wording, and structure are fixed; the app never modernizes the document, only the input experience.
2. **Official strings are data.** Spec §3 lists every energy category, every example string, the worker acknowledgment, and the safety-gate question verbatim from the form. They are never paraphrased, reworded, or deduplicated (some strings legitimately repeat across categories, e.g. "Pressure relief systems" under both Pressure and Sound).
3. **Two-level energy selection.** The user selects categories AND specific example strings (field-user clarification, Change Order 1). Marking an example auto-selects its category; a category may have zero examples. PDF highlights: wheel wedge + rim ring band + category-name cell per category (Human Factors = center circle), plus each marked example's bullet line.
4. **The safety check never carries.** A new day copies everything from the most recent AHA for the job except `safetyCheck`, which is always null and must be answered fresh. Post-completion edits to work content clear it again; signatures are retained.
5. **Three-tier Review validation (spec §5), enforced only at Review** — never while typing. Blocking: unanswered safety check, unanswered rescue plan, incomplete task rows, empty crew, blank description or essential site/emergency fields. Advisory (`Add` / `Not applicable`): work order, JHA numbers, meeting notes. "Not applicable" prints blank, never "N/A".
6. **Signing Mode is a lockout with read-only eyes.** Nothing editable while the iPad passes around; workers can open a read-only AHA view; official acknowledgment shown verbatim; per-worker timestamps stored (in-app only, never printed); re-sign replaces with confirm; exiting with unsigned workers leaves status `in_progress`.
7. **Completion** requires every listed crew member signed plus all blocking items clear. Late arrivals join via "+ Add worker & sign" on the completed AHA; the PDF regenerates, existing signatures untouched.
8. **Local-first.** Dexie/IndexedDB autosave on every change; the entire daily flow, including PDF generation, works offline. Backend is backup, not a dependency.
9. **Auth is a gate code, not accounts.** One shared access code, hashed comparison via node:crypto, rate-limited. No users, sessions, roles, or auth frameworks — ever in v1.
10. **Stack is pinned and closed** (spec §1, AGENTS.md). External Neon Postgres via drizzle + @neondatabase/serverless (Replit's DB deliberately unused); @cantoo/pdf-lib for PDF; signature_pad for capture; Tailwind 4; react-router 7; zod shared schemas. TanStack Query is limited to generated remote API/server-state hooks; Dexie alone owns local AHA state. Exact pins, pnpm lockfile, zero new dependencies without a justified dedicated PR. Banned outright: application-state libraries, auth frameworks, ORM substitutions, CDN-loaded production assets.

## How the build runs (workflow contract)

- **Division of labor:** Codex writes all feature code via GitHub PRs. Replit is where the app runs, gets visually verified (webview + physical iPad Safari), and deploys. Replit's own Agent is used only for platform/config triage. One writer at a time; `main` is always what Replit runs.
- **Environment facts for Codex:** pnpm monorepo — client at `artifacts/client`, server at `artifacts/api-server`, DB access at `lib/db` → Neon via `DATABASE_URL`. Setup installs from the frozen lockfile; the sandbox has no network during the working phase, so a "missing package" is a spec conversation, not an install. No secrets are provided; phases 1–3 never need a live database, and phase 4 generates migrations without applying them (the human applies them from the Replit shell).
- **Codex cannot see the Replit/iPad runtime.** Repository design references guide implementation; the human verifies rendering in Replit and on the iPad. Statements about device-specific visual results are hypotheses until verified.
- **Every PR** ends with typecheck, build, tests, and `pnpm audit` results in the description, plus a list of any spec ambiguities encountered and how they were resolved — that section is the first thing reviewed.

## Phase roadmap (spec §9 is normative)

1. **Phase 1 (next):** Dexie schema per §2 + canonical §3 constants module; autosave with quiet status; Home's four states; Details + Work editors; copy-from-most-recent with the safetyCheck-null rule (unit-tested); prefill banner; crash recovery.
2. **Phase 2:** Energy (cards, example chips, wheel preview from `/assets/aha-energy-wheel-recolored.png`, daily-unanswered gate); Review (three tiers, deep links, Today's Crew + Edit Crew); Signing Mode complete.
3. **Phase 3:** Port `/assets/aha-clean-template.py` 1:1 to `src/pdf` with @cantoo/pdf-lib, including the `line_rects` example-highlight map; `/pdf-test` visual-diff route against `/assets/aha-clean-filled-sample.pdf`; Completed screen.
4. **Phase 4:** Thin backend per §8, gate-code auth, sync + backup status, PWA hardening, and first-run job setup.

Acceptance for the whole build is spec §11's eight scenarios, run by the human on the iPad.
