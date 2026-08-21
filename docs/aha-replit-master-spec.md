# ITS AHA App — Replit Master Build Specification (v1.9)

_v1.9 changelog: makes app reloads prompt-only and locally diagnosable, prevents the empty-job state from appearing before backup discovery finishes, and makes empty-device job selection deliberate and scalable while keeping multi-crew isolation on the post-pilot roadmap. v1.8 canonicalized PDF-version timestamp identities, added a safe read-only paused-recovery state, and permitted a compact supplemental Energy Wheel in every worker-specific review-and-sign flow without changing the official PDF. v1.7 defined targeted completed-AHA corrections, structured document events, same-job locking, safety-update attestation, and immutable current/superseded PDF evidence. v1.6 clarified “Start without previous work,” replaced competing Person-in-charge controls with one chooser, and permitted a transient Spanish presentation of fixed worker-review copy while canonical storage and the official PDF remain English. v1.5 reconciled the safety-gate instruction with the authoritative ITS PDF renderer/reference, using double quotes around "yes". v1.4 replaced the optional worker-review detour with one continuous, read-only AHA followed by the official acknowledgment and signature; the crew list remains the handoff controller. v1.3 clarified that FOREMAN is the official Person in charge, not necessarily the device operator; the app may associate that printed name with a crew worker ID for unambiguous presentation. v1.2 moved the database to external Neon (Drizzle + @neondatabase/serverless), pinned the PDF/frontend stack, added the §3 no-deduplication rule, detailed gate-code auth, and expanded §10 exclusions. Supersedes v1.0–v1.8._

You are building a mobile-first PWA that lets a construction crew lead complete the company's daily Activity Hazard Analysis (AHA) on an iPad, collect 5–10 finger signatures, and produce a PDF that exactly matches the official ITS form (IS_F_222_EN.2203). The app UI is modern and touch-first; the PDF output is the fixed official company sheet.

**Attached assets (treat as authoritative):** approved design screenshots (match them); `aha-clean-template.py` (the PDF layout — port it, do not redesign it); `aha-energy-wheel-recolored.png` (used in-app AND in the PDF); `aha-clean-filled-sample.pdf` (your PDF output must match this); `aha-clean-template-blank.pdf` (blank reference); ITS logo.

**Success test:** a worker with mediocre tech skills completes the normal morning flow without instruction; an experienced user never feels slowed down. Never lose entered safety information because of connectivity or a stray tap.

---

## 1. Stack & architecture

- **Frontend:** Vite + React 19 + TypeScript 5, PWA via vite-plugin-pwa (Add-to-Home-Screen capable), Tailwind CSS 4 with the palette as CSS-variable tokens, react-router 7, signature_pad for signature capture. Single-column mobile-first; iPad is primary device. All dependencies pinned to exact versions; committed lockfile; no new dependencies without justification.
- **Local-first storage:** IndexedDB (Dexie). Every meaningful change autosaves locally. The app must fully work offline: create/edit/sign/finalize/generate PDF with no network.
- **PDF generation:** client-side with @cantoo/pdf-lib (maintained fork of pdf-lib, identical API). See §7.
- **Backend:** thin Express 5 + external **Neon** serverless Postgres (DATABASE_URL env var — do NOT provision Replit's built-in database), accessed via Drizzle ORM + drizzle-kit migrations and the @neondatabase/serverless driver. Zod schemas shared client/server. Purpose: backup/sync of jobs, AHAs, and finished PDFs (stored as bytea). No Replit-proprietary APIs; all config via env vars.
- **Auth:** single shared access code (a gate code, not a login). First launch shows a lock screen — "Enter your crew's access code" — verified server-side against a hashed env var (ACCESS_CODE_HASH); the device stores a token and never asks again unless the code rotates or the server returns 401 (which re-shows the lock screen without losing local data). Rate-limit auth attempts (e.g., 5/minute/IP). No user accounts, no roles, no sessions UI, no reset flows. The current token, API, and stored records belong to one shared backup namespace; they do not identify or isolate a company, crew, or user. Multi-crew rollout therefore requires explicit server-enforced scope and local-storage isolation and remains post-pilot roadmap work. Do not add multiple crew codes or dormant crew fields without that complete boundary.
- **Fonts:** Barlow (500/600/700), bundled locally in the repo — no font CDN (offline requirement). PDF uses Helvetica (built into pdf-lib), matching the template.
- **Typography/palette:** ITS Blue #374B96 (primary), Deep ITS #2A3A78, periwinkle tints #EAEDF7 / #C6CDE8, background #F5F6F9, borders #D9DDE7, text #191D2B / secondary #59617A, attention orange #E8720C (warnings ONLY), confirmation green #1E8E3E (always paired with a ✓ glyph). Minimum touch target 48px; body text ≥16px, weight ≥500.

## 2. Data model

```
Job {
  id, name, cityLabel,
  defaults: { location, personInCharge, closestEmergencyCentre, emergencyNumber,
              musterPoint, workOrderPermit, jhaProcedureNumbers },
  roster: [{ id, name }]           // persistent worker names for this job
}

AHA {
  id, jobId, date,
  status: 'draft' | 'in_progress' | 'completed',   // in_progress = signing has begun
  header: { location, date, personInCharge, closestEmergencyCentre, emergencyNumber,
            musterPoint, workOrderPermit, jhaProcedureNumbers, rescuePlanRequired: true|false|null },
  description, meetingNotes,
  notApplicable: { workOrderPermit: bool, jhaProcedureNumbers: bool, meetingNotes: bool },
  tasks: [{ id, task, hazards, controls }],
  energySelections: [{ category, examples: [string] }],   // strings MUST be from §3 verbatim
  safetyCheck: null | 'yes' | 'no',
  crew: [{ workerId, name, signaturePng|null, signedAt|null }],
  personInChargeWorkerId: string|null,     // internal crew association; never printed
  completedAt|null, updatedAfterCompletionAt: [timestamps],
  documentEvents: [{ id, kind, reason, note|null, occurredAt,
                     fromDocumentRevision|null, toDocumentRevision,
                     affectedWorkers: [{ workerId, name }],
                     crewReviewConfirmation|null }],
  pendingCompletedUpdate: null | { id, startedAt, baselineDocumentRevision,
                                   kind: 'safety'|'administrative',
                                   crewReviewConfirmation|null },
  sync: { savedLocallyAt, backedUpAt|null }
}
```

## 3. Canonical form data (verbatim — never paraphrase, never invent)

These strings are data from the official form. Example chips, editor Review listings, stored AHA data, and PDF highlighting all use them exactly. The worker-specific review-and-sign page may present the approved Spanish display mappings described in §4; this presentation-only exception never changes the canonical English values stored in the AHA or printed in the official PDF.

- **Gravity:** Excavation cave-in · Falling or sliding materials/objects · Slips/trips/falls · Working at heights
- **Motion:** Wind · Road/ground conditions · Flying particles/debris · Simultaneous operations · Watercourses · Ergonomics · Congestion · Vehicles/vessels/mobile equipment
- **Mechanical:** Tool/equipment nip points/pinch points · Vibration · Rotating equipment
- **Electrical:** Electrical equipment/lines - normal or abnormal condition (shock or arc flash) · Non-intrinsically safe tools/equipment · Static electricity · Induced voltage
- **Pressure:** Compressed cylinders · Pressurized piping/hoses/equipment · Tanks/vessels · Pressure relief systems
- **Sound:** Tools/equipment · Pressure relief systems · Purging
- **Radiation:** Welding arc · NDT/X-ray · NORM · Infrared scanners · Sun
- **Biological:** Plants · Insects · Needles · Reptiles · Viruses · Animals · Mold · Bloodborne pathogens · Birds · Bacteria
- **Chemical:** Flammable/combustible · Toxic vapors/dusts/fibers/fumes · Corrosive · Skin/eye irritants · Designated substances, pipeline contaminants, spills, suspect soils · Reactive
- **Temperature:** Cold surfaces (Nitrogen, LNG, propane) · Hot surfaces (friction, heat sources) · Hot emissions/vapors · Weather conditions · Ignition sources
- **Human factors:** Knowledge/skill · Risk tolerance · Working alone · Training · Communication · Fit for duty · Deviation from plan

**Note:** some example strings legitimately appear under more than one category on the official form (e.g., "Pressure relief systems" is listed under BOTH Pressure and Sound). Do NOT deduplicate examples across categories — each category's list stands alone, in the order given above.

**Worker acknowledgment (shown verbatim in English mode and stored only as this canonical policy text):** "I have reviewed all applicable documentation, site hazards, and my responsibilities to follow safe work plans to protect myself and others while on site." Spanish worker-review mode displays the product-owner-approved Spanish presentation in its place; English remains one tap away.

**Safety gate question (verbatim):** "Have all known hazards been identified and addressed using the Energy Wheel?" — with the form's instruction `Do not proceed until you can answer "yes"` honored as a hard block (§5).

## 4. Core behaviors

- **Start today's AHA:** one tap. Copies the latest saved version of the most recent AHA for this job (handles weekends/gaps) — header, description, tasks, meeting notes, energy categories AND examples, crew roster. Sets today's date. Shows dismissible banner: "**Started from {date}.** Review anything that changed today. — Start without previous work". “Start without previous work” rebuilds today's AHA from this job's configured defaults: it preserves editable location, Person in charge, emergency details, muster point, work/JHA defaults, and the unsigned job roster; it clears copied description, tasks, meeting notes, N/A choices, rescue-plan answer, Energy selections, safety check, signatures, completion/update state, and today's stored PDF. It confirms only if today's draft has edits. This action changes how today starts within the same job; it is not a project switch. A genuinely different project/site requires a new job setup in Phase 4, and historical job records are never renamed into a new project. First AHA of a job starts from job defaults with no banner.
- **safetyCheck NEVER copies.** It is null every new day and must be answered fresh.
- **Autosave:** every change → IndexedDB. Header shows quiet "Saving… → Saved ✓". Offline: "Offline · Saved on this iPad ✓". No Save buttons, no unsaved-changes dialogs, ever. Reopening the app with a draft/in-progress AHA lands on Home's matching state (crash recovery). The app has no inactivity reload: service-worker updates are checked on foreground/reconnect but install only after `Update now` is tapped on Home. Intentional reloads share one local-only, non-sensitive diagnostic path; an external browser or development-preview reload is recovered but never mislabeled as an app-requested update.
- **Energy selection:** category cards toggle selection; "See examples" expands official examples as multi-select chips; marking an example auto-selects its parent category; a category may be selected with zero examples; unchecking a category clears its examples; one panel open at a time; collapsed selected cards show "N examples marked". Wheel preview mirrors category selections (Human Factors = center circle).
- **Completed AHA corrections:** completion is a signed checkpoint, not an unrestricted editable form. The Completed hub remains the single entry point for viewing/sharing the current PDF, adding a late worker, replacing one worker's signature, removing an erroneous worker, updating work or hazards, and viewing document history. Corrections remain available until a later AHA for the same job is started; midnight alone does not lock overnight work. A pending PDF must be finished before another correction begins. Replacing a signature requires the targeted worker to repeat the full continuous review and never transfers ink between names. Removing a worker requires a structured reason, preserves an audit snapshot without signature ink, and cannot remove the final crew member. All unaffected signatures and the original completion time remain saved.
- **Post-completion updates:** changes to location, Person in charge, emergency details, muster point, rescue-plan answer, description, tasks/hazards/controls, Energy selections, or meeting notes clear safetyCheck and any pending crew-review confirmation. The exact safety gate must be answered Yes again and the named Person in charge must explicitly confirm that the updates were reviewed with today's crew before the PDF regenerates. Existing signatures are retained for this release; requiring all current crew to re-sign remains a future policy decision pending ITS operational validation. Work-order/permit and JHA/procedure reference corrections are administrative and do not repeat the safety gate. Every completed update records structured audit metadata and preserves the prior finalized PDF as a superseded document revision.
- **Signing Mode:** full-screen; persistent banner "SIGNING MODE — HAND THE DEVICE TO EACH CREW MEMBER"; nothing editable. The crew list is the handoff controller: its helper says "Select each worker to review today's AHA and sign.", unsigned rows say "Review & sign ›", and signed rows show "Signed {time} ✓". "View today's AHA" opens the complete Review summary read-only, including the crew roster. Selecting an unsigned worker opens one naturally scrolling page containing, in order: worker identity/date/FOREMAN when applicable/READ ONLY; the instruction to ask the Person in charge about anything unclear; every official job and emergency detail; description; every task/hazard/control; selected energy information; safety-check result; meeting notes; the official acknowledgment (§3); and the signature canvas. Only the crew roster is omitted from this worker-specific presentation. Its Energy section includes the same official Energy Wheel as a compact, non-interactive supplemental visual: 140–160px above the translated selected-category list on a 393px phone and 160–180px beside that list on an 834px iPad. The selected category names/examples remain authoritative, the visible wheel never replaces them or the safety-check result, and the wheel does not appear in editor Review, roster overview, Completed, or the PDF. The app presents the full AHA before the signature but does not claim to verify that every line was read. There is no scroll detector, review checkbox, document-within-a-document viewport, accordion, or jump-to-sign control. Clear and CONFIRM SIGNATURE follow the canvas; Confirm requires ink, and added workers also require a nonblank name. A successful normal, added-worker, or replacement signature returns to the crew list, announces "✓ Signature saved", and restores focus to that worker's row; it never advances automatically. Re-sign: tapping a signed row → "{Name} has already signed." [View signature] [Sign again] (confirm, replaces after repeating the continuous review). "+ Add Worker" uses the same continuous page with a name field at the top. "Exit signing" with unsigned workers → confirm ("3 workers still haven't signed.") and leaves status in_progress; with all signed, no warning. Signature timestamps are stored and shown in-app but do NOT print on the PDF.
- **Spanish worker review:** each worker-specific continuous page—normal signature, re-sign, added worker, and late worker—has a 48px `English | Español` presentation control near the worker identity. Every newly selected worker starts in English; the choice is transient, is never persisted, and does not carry to the next worker. Spanish mode translates fixed app labels, dates, status values, canonical Energy category/example presentation, recoverable worker-flow messages, signature controls, and the approved Spanish acknowledgment. Job names, worker names, locations, emergency information, descriptions, tasks, hazards, controls, work/JHA numbers, and meeting notes remain exactly as entered and are not automatically translated. A Spanish notice tells the worker this and instructs them to ask the Person in charge about anything unclear. Switching language preserves scroll position, an entered added-worker name, signature ink, retry state, and in-flight guards. The roster, "View today's AHA" overview, editor Review, Completed, storage, and PDF remain English-only. This translation is a product-owner-reviewed presentation aid, not a certified translation.
- **Empty-device recovery:** recovery copies deliberately selected jobs, AHAs, current PDFs, and version metadata into local storage; it never enables live synchronization or deletes remote evidence. While an authorized empty device checks saved progress and the backup service, the app shows neutral `Opening saved work…` presentation and must not render `No job is set up yet`. Discovery failures offer `TRY AGAIN` and `SET UP WITHOUT RESTORING`; jobs begin unselected, are ordered by job name/city, show a selected count, and gain local name/city search when more than five are available. One explicitly selected restored job becomes active and opens Home; multiple restored jobs open the chooser and are never resolved by guessing. A resumable recovery that is idle or has failed offers `TRY AGAIN` and `LEAVE FOR NOW`. Leaving preserves its progress and every verified local copy, dismisses the modal for the current browser session, and shows `Recovery paused — Resume`; reopening the app offers the saved recovery again. While paused, Home, active-job selection, completed-document viewing/sharing, and document history remain available, but job defaults, new-job setup, starting, editing, correcting, removing, adding, or signing an AHA are blocked at both the route and persistence boundaries. Recovery copy is device-neutral, explains that private browsing may clear local progress when all private windows close, and never exposes raw HTTP errors. Corrupt saved progress may be safely restarted without deleting verified local records or remote backups.
- **Completion:** FINISH TODAY'S AHA enables only when every worker in today's crew has signed AND all must-fix items pass. Completing generates and stores the PDF.
- **Late arrival (completed AHA):** "+ Add worker & sign" → name plus the same continuous worker review → acknowledgment → signature → PDF regenerates; existing signatures and completion time remain untouched, the correction is audited, and the previous PDF remains available as superseded evidence.
- **Crew editing (Review):** Today's Crew card seeded from the roster / previous day; Edit Crew = in-place checklist (+ Add worker). Removing an absent worker adjusts the signing denominator; removing a worker who already signed requires confirmation and deletes that signature. Renaming a signed worker warns and clears their signature — never silently reassign.
- **Person in charge / FOREMAN:** These are the same business role. Details shows one required selection card—not a competing text field and crew selector. It displays an associated worker as `FOREMAN · Today’s crew`, a custom person as `Not in today’s signing crew`, or `Choose person in charge` when empty. Its chooser offers immediate-action rows for today's crew and a `Someone else` custom-name path with explicit Save. The official name is printed on the PDF; an associated present crew worker receives the FOREMAN badge. Duplicate crew display names receive non-printing `1 of N` qualifiers in the chooser and are never associated by guessing. An empty crew still permits a custom person and explains that signing crew can be added at Review. The person entering the AHA on the device is not inferred or tracked. Phase 4 first-run setup collects isolated job defaults and roster before a default Person in charge; v1 has no company-wide worker directory.

## 5. Validation — three tiers, enforced ONLY at Review (never while typing)

- **Must fix (blocks signing):** safetyCheck ≠ 'yes'; rescuePlanRequired unanswered; any task with an empty task/hazards/controls field; crew empty; description blank; any of location / person in charge / emergency number / closest emergency centre / muster point blank.
- **Warnings (overridable, each with `Add` · `Not applicable`):** work order/permit, JHA/procedure numbers, meeting notes. "Not applicable" silences the warning; the field prints blank on the PDF (never print "N/A").
- **Informational:** counts/confirmations. Warnings render amber with the ⚠ icon + text (never color alone, never red); each has a `Fix` that deep-links to the exact field.

## 6. Error handling — four patterns, reused everywhere

1. Recoverable input: "Controls are missing for this task." `Fix`
2. Offline: "You're offline. Your AHA is saved on this iPad and you can keep working." (never the word "error")
3. Operation failed: "We couldn't create the PDF. Your AHA and signatures are still saved." `Try again` (never lose data; never require re-signing because rendering failed)
4. Destructive confirm: "Delete this task? This can't be undone." `Cancel` · `Delete`

Overflow limits (graceful caps, no silent truncation): 10 signature slots, 15 task rows, per-field text capacity — warn "This won't fit on the ITS sheet. Shorten it or split the work." Text rendering may auto-shrink within the template's limits (the port defines them) but never below legibility.

## 7. PDF engine — port `aha-clean-template.py`, do not redesign

`aha-clean-template.py` (attached, ReportLab) is the literal layout spec: page geometry, every field coordinate, fonts/sizes, table structure, wheel placement, wedge angles, highlight geometry, signature grid. Port it 1:1 to a TypeScript module using @cantoo/pdf-lib (`/src/pdf/`). Embed `aha-energy-wheel-recolored.png` and the ITS logo as assets.

- Highlights (translucent yellow, alpha ≈0.38): per selected category → wheel wedge tint + rim ring-band over the category label + the category-name cell in the Energy table; Human Factors → center circle instead of a wedge. Per marked example → that example's bullet line in the table (already implemented in the attached template via its `line_rects` map — port it 1:1).
- Signatures: captured strokes/PNGs placed in the sign-off grid cells with the worker's typed name in the name column (grid coordinates in the template).
- Checkboxes: rescue plan Yes/No and safety-gate Yes/No get an X per the template's draw_x.
- Build a dev-only route `/pdf-test` that renders the sample data from the template file and displays the PDF beside `aha-clean-filled-sample.pdf` for visual diff. **Acceptance: your output is indistinguishable from the sample.**
- Output filename: `AHA_{jobName}_{YYYY-MM-DD}.pdf`. Sharing: Web Share API with the PDF file (iOS share sheet → Mail/print); download fallback.

## 8. Backend (thin)

- `POST /api/auth` (access code → token) · `GET/POST /api/jobs` · `GET/POST/PUT /api/ahas` (JSON) · `GET/PUT /api/ahas/:id/pdf` (current binary) · `GET /api/ahas/:id/pdf/versions` (current and superseded metadata) · `GET /api/ahas/:id/pdf/versions/:sourceRevision?generatedAt=…` (one exact historical binary). Bearer token on everything. The current-PDF contract remains backward compatible. Distinct finalized PDF versions are retained in `aha_pdf_revisions`; exact identity/checksum retries are idempotent and an identity with different bytes is rejected without overwriting evidence. PDF version identity is `(ahaId, sourceRevision, generatedAt)`, where every emitted/stored application timestamp is canonical UTC ISO 8601. Exact-download input remains tolerant of previously cached valid PostgreSQL timestamp strings, which normalize to the same instant before lookup; timestamp aliases never create a second evidence artifact.
- Sync is fire-and-forget with retry: local save always succeeds first; backup status surfaces as "☁ Backup waiting for connection" → "✓ Backed up". Last-write-wins by timestamp; no conflict UI.

## 9. Build phases — one phase per prompt, checkpoint after each

- **Phase 1:** scaffold, data model, IndexedDB autosave, Home (all four states), Details + Work editor sections, copy-from-most-recent, prefill banner, crash recovery.
- **Phase 2:** Energy (cards + example chips + wheel + gate), Review (three tiers, Fix deep-links, Today's Crew + Edit Crew), Signing Mode complete (read-only review, add worker, re-sign, exit confirm, timestamps).
- **Phase 3:** PDF engine port + /pdf-test diff route, Completed screen (View PDF, Print/Share, Update today's AHA, + Add worker & sign, "Updated {time}" chip), post-completion rules.
- **Phase 4:** Express/Postgres backend + access code + sync status, PWA manifest/service worker, offline hardening, first-run job setup.

After each phase: smoke-test on a physical iPad in Safari (signature canvas and Add-to-Home-Screen behave differently than desktop preview).

## 10. Do NOT build (v1 exclusions)

User accounts, roles, permissions, invites, password reset · admin dashboards, analytics, charts · multi-company/tenant anything · email composer or server-side email · supervisor approvals or bulk crew re-sign policies (the targeted same-worker correction in §4 is permitted) · configurable form templates or form builder · sync-conflict resolution UI · worker PINs or QR codes · onboarding tutorials · AI-generated safety suggestions · any home screen that isn't essentially "Start today's AHA" · any change to the PDF layout · any rewording of §3 strings · supervisor notifications/reminders (e.g., "crew hasn't signed by 10 AM") — future roadmap, not v1 · application-state libraries (Redux/Zustand/MobX — Dexie liveQuery covers local AHA state) · auth frameworks (Passport/JWT/next-auth — auth is a code-hash compare with node:crypto) · ORM substitutions (no Prisma) · moment.js · CDN-loaded production assets · any new or upgraded dependency outside a dedicated, justified PR.

Non-binding future architecture and product questions are recorded separately in [`post-pilot-product-roadmap.md`](./post-pilot-product-roadmap.md). That roadmap does not authorize any §10 exclusion.

**TanStack Query boundary:** the existing generated React Query client remains approved for remote API/server state only. It must never own or mirror local AHA editor state; Dexie is authoritative for that data.

## 11. Acceptance scenarios (all must pass)

1. Monday morning: open app → one tap start → prefilled from Friday → edit one task → Energy: flip "Wind" off, "Ergonomics" on (2 taps) → answer gate → Review clean → 8 signatures → FINISH → PDF matches official format with correct highlights.
2. One worker absent + one task changed: Edit Crew removes him (denominator becomes 7), task edited, completes normally.
3. Worker review: mid-signing, select a worker's "Review & sign ›" row → the full read-only AHA appears in natural page order without the crew roster → toggle Español and verify fixed safety copy, Energy names/examples, date, acknowledgment, controls, and recoverable messages change while crew-entered daily content remains verbatim → toggle English → the official acknowledgment and signature canvas follow at the bottom → save returns to the roster with "✓ Signature saved" and focus on that worker. Language starts in English for the next worker. Nothing is editable en route, and the app makes no claim that scrolling proves the worker read every line.
4. Late arrival at 11 AM: completed AHA → + Add worker & sign → PDF regenerates with 9 signatures, original 8 untouched.
5. Post-completion change: edit a control → safety check clears with explanation → re-answer Yes → PDF regenerates; signatures remain; "Updated" chip shows.
6. Kill the app mid-draft: reopen → Home shows Draft state → CONTINUE TODAY'S AHA → nothing lost.
7. Airplane mode all morning: entire flow works including PDF; status shows saved-on-device; reconnect → auto-backup.
8. 11th worker / 16th task / oversized text: graceful cap messages, nothing silently dropped.
