# LANGUAGE TIER 1 REMEDIATION PLAN

## Frame

This document is the operational companion to the non-negotiable principle "Polish authoritative, English bridge" added to MASTER_PLAN.md at commit 5873fca. The principle is constitutional. This document specifies the foundational fixes (Tier 1) that bring the codebase into structural compliance with the principle.

Tier 1 scope is limited: make the language toggle universally available across all result pages, addressing the four foundational defects identified in the language toggle verification report at commit 41dedd1. Tier 1 does NOT include per-page content translation across the 106 pages currently without i18n -- that is Tier 2, a multi-month sub-phase tracked separately.

Tier 1 estimate: 4-8 hours of focused work.

Tier 1 success: every result page in both apps (lawyer-facing dashboard and worker-facing workforce-app) inherits the canonical LanguageToggle component from a shared location. The toggle is accessible in zero or one clicks from every result page. The default language for new sessions is decided per Sub-task 4.

## Companion Documents

This Tier 1 remediation plan references companion documents in the same directory:

- artifacts/api-server/docs/MASTER_PLAN.md (commit 5873fca) -- the directional plan; principle "Polish authoritative, English bridge" (principle #16 of 20)
- artifacts/api-server/docs/LANGUAGE_TOGGLE_VERIFICATION.md (commit 41dedd1) -- the bilingual gap register; this document operationalizes the verification report's recommendations
- artifacts/api-server/docs/LAYER_0_DESIGN.md (commit 3e0dead) -- the Layer 0 architectural design
- artifacts/api-server/docs/LAYER_0_TESTABILITY.md (commit 1d10251) -- the Layer 0 comprehension test suite
- artifacts/api-server/docs/EU_AI_ACT_ARTICLE_6_RESEARCH.md (commit bf4d92b) -- the EU AI Act conformity research

Forward reference (document to be saved subsequently):
- LANGUAGE_TIER2_REMEDIATION.md -- the per-page content translation plan; multi-month sub-phase; to be created after Tier 1 lands and Tier 2 prioritization is decided
- LANGUAGE_TOGGLE_VERIFICATION_v2.md (or similar) -- the re-verification report after Tier 1 execution; required as part of Tier 1 acceptance criteria

## Status

Tier 1 status: planned, not started.

Tier 1 scope: four sub-tasks addressing the four foundational defects in the verification report. Sub-tasks 1-3 are straightforward extractions and mounts. Sub-task 4 (EN-to-PL default flip) carries a chicken-and-egg analysis and requires a design decision before execution.

Tier 1 estimate: 4-8 hours of focused work, decomposed:
- Sub-task 1 (Extract LanguageToggle): ~30 minutes
- Sub-task 2 (Mount in AppShell): ~5 minutes after extraction
- Sub-task 3 (Workforce-app toggle): ~1 hour mirror
- Sub-task 4 (EN-to-PL default flip decision and execution): ~30 minutes if Sub-option C is chosen, depending on which sub-option is selected
- Re-verification pass per Acceptance Criteria #7: ~1-2 hours including saving the v2 verification report
- Buffer for surprise (test failures, unexpected dependencies, layout drift): ~1-2 hours

Pre-Tier-1 baseline (per verification report at commit 41dedd1):
- 1.7% of result pages have a working toggle (2 of 115)
- 0% match Polish-default rendering
- 92% have no i18n at all (hard-coded English)

Post-Tier-1 expected baseline:
- 100% of AppShell-wrapped pages have toggle access
- Default language matches the Sub-option C decision (workforce-app PL, dashboard EN-pending)
- The 92% no-i18n pages still render English content (Tier 2 unchanged)

## Sub-task 1 -- Extract LanguageToggle

Foundational defect addressed: LanguageToggle is currently a private function inside Dashboard.tsx (declared as `function LanguageToggle()`, no export). It cannot be imported by other pages. This forces every page that wants a toggle to re-implement one.

Action: extract the LanguageToggle function from Dashboard.tsx into a new shared component file at:

artifacts/apatris-dashboard/src/components/LanguageToggle.tsx

The extracted component preserves the existing behavior verbatim:
- Reads current language from useTranslation hook
- Toggles between "en" and "pl" via i18n.changeLanguage
- Renders flag-emoji buttons (🇬🇧 EN and 🇵🇱 PL) with the existing styling
- Persists to localStorage via i18next's existing wiring

Export the component as the default export. Update Dashboard.tsx to import the extracted component instead of defining it locally.

Estimate: ~30 minutes including testing that Dashboard still renders the toggle correctly after the import substitution.

Acceptance: Dashboard.tsx no longer contains the LanguageToggle function definition. The new components/LanguageToggle.tsx file exists and exports the component. Dashboard renders the toggle identically to before.

## Sub-task 2 -- Mount in AppShell

Foundational defect addressed: AppShell.tsx (the global layout wrapper for the lawyer-facing dashboard) does not render a language toggle. Every page wrapped by AppShell inherits the layout but not the toggle. The toggle's visibility is therefore tied to whether the user is on the Dashboard page specifically.

Action: import the extracted LanguageToggle component (from Sub-task 1) into AppShell.tsx and render it in the AppShell header. Choose a header location that:
- Is visible on every AppShell-wrapped page
- Does not interfere with existing header content (NotificationBell, user identity, logout)
- Is accessible in zero or one clicks (per the principle's accessibility requirement)

The placement convention should match Dashboard's current placement so users who learned the toggle on Dashboard find it in the same visual region after the AppShell mount.

Estimate: ~5 minutes after Sub-task 1 completes. The technical change is trivial; the placement decision may take longer if header layout requires adjustment.

Acceptance: Every dashboard route wrapped by AppShell shows the LanguageToggle in its header. Verified by spot-check of 10 randomly selected pages from the verification report's MISSING list (which were all AppShell-wrapped per the architecture). No previously-working header functionality is regressed.

## Sub-task 3 -- Workforce-app toggle

Foundational defect addressed: workforce-app has no language toggle UI at all. The i18n setup exists at artifacts/workforce-app/src/lib/i18n.ts (with localStorage key "wf_lang"), and DashboardPage uses useTranslation for t() keys, but no toggle component exists anywhere in the app. Workers have no way to switch language.

Action: mirror the dashboard's Sub-task 1 + Sub-task 2 work in workforce-app:

(a) Create artifacts/workforce-app/src/components/LanguageToggle.tsx with the equivalent component (reading from workforce-app's own useTranslation, toggling workforce-app's own i18n instance with localStorage key "wf_lang").

(b) Mount the component in workforce-app's AppShell (artifacts/workforce-app/src/components/AppShell.tsx) or equivalent layout component. Workforce-app's AppShell is currently a pass-through; this Tier 1 work adds the toggle as the first substantive UI element it renders.

The two LanguageToggle components (dashboard's and workforce-app's) are not literally the same component because they bind to different i18n instances. They are functionally equivalent and visually consistent.

Estimate: ~1 hour including the workforce-app's AppShell becoming non-trivial (it currently does very little; adding header layout for the toggle requires light design work).

Acceptance: workforce-app DashboardPage and any future workforce-app page wrapped by the layout component shows the LanguageToggle. Worker can toggle language without leaving the page.

## Sub-task 4 -- EN-to-PL Default Flip Decision

The verification report identified the EN-to-PL default flip as a candidate for Tier 1 inclusion. This sub-task evaluates whether and how to execute the flip given the chicken-and-egg analysis below.

Chicken-and-egg analysis:

If the default is flipped to PL while 92 percent of result pages have hard-coded English content (no i18n integration), the user experience is: page renders in PL by selection, but the actual displayed content is still English because strings are not wrapped in t() and pl.json keys do not exist. The user sees no improvement, only a confused state where the language toggle suggests Polish is active but Polish content does not appear.

If the default stays at EN until Tier 2 covers high-priority pages, the user experience is: pages render in EN by default, the user can toggle to PL and see PL content for the small number of fully-translated pages, but the system does not honor the principle's "Polish authoritative" framing at the default level.

The decision is between two imperfect options. Three sub-options for resolving:

Sub-option A -- Defer the flip until Tier 2 covers a defined set of high-priority pages (recommendation: cover at least all worker-facing pages and the top-10 lawyer-facing pages before flipping). Pro: avoids degraded UX. Con: principle's default-language clause stays unhonored at the technical level until Tier 2 progress is sufficient.

Sub-option B -- Flip the default now and accept the degraded UX as a known transition state. Document the transition state explicitly so users (lawyers, clients) understand. Pro: principle is structurally honored at the default level. Con: real users have a worse experience until Tier 2 catches up.

Sub-option C -- Flip the default for the workforce-app only (client-facing, where worker comprehension matters most) and defer the dashboard flip until Tier 2 progresses. Pro: honors principle where it matters most (clients) without degrading lawyer UX. Con: introduces inconsistency between the two apps' default-language behavior.

Recommended sub-option: C. Worker-facing pages have higher stakes for Polish-default rendering (foreign workers may not read English well). Lawyer-facing pages have lower stakes because lawyers are bilingual operators. Sub-option C prioritizes user impact.

This sub-task as scoped:

(a) Confirm Sub-option selection (A, B, or C) before executing the flip
(b) For workforce-app (Sub-option C path): change i18n.ts default from 'en' to 'pl'; verify against test workforce-app pages
(c) For dashboard (Sub-option C path): defer until Tier 2 decision

If a different Sub-option is selected, the sub-task scope adjusts accordingly. Decision authority: Manish.

## Acceptance Criteria

Tier 1 is considered complete when:

1. Canonical LanguageToggle component lives at artifacts/apatris-dashboard/src/components/LanguageToggle.tsx (extracted from Dashboard.tsx)
2. Dashboard's AppShell.tsx renders the LanguageToggle in the header
3. Every dashboard result page inherits the toggle via AppShell (verified by spot-check of 10 randomly selected pages from the verification report's MISSING list)
4. Workforce-app has equivalent LanguageToggle component (location: artifacts/workforce-app/src/components/LanguageToggle.tsx or equivalent)
5. Workforce-app's AppShell or layout component renders the toggle
6. Sub-task 4 EN-to-PL default flip decision is recorded (sub-option selected; flip executed per the selected sub-option)
7. Re-verification pass against the verification report's methodology produces a VERIFIED count after Tier 1 matching the count of result pages wrapped by AppShell. The exact percentage is determined by the AppShell coverage discovered during execution; the criterion is structural (every AppShell-wrapped page passes verification) rather than numerical (a specific percentage threshold). The re-verification must be run as a discrete sub-step after Tier 1 build work is complete and produces an updated verification report (LANGUAGE_TOGGLE_VERIFICATION_v2.md or similar). Tier 1 is not considered complete until the re-verification report is saved to the repository.

## What Tier 1 Does Not Do

Tier 1 explicitly does NOT include:

- Per-page content translation. The 106 pages currently without i18n imports remain hard-coded English at the content level. They will inherit the toggle (via AppShell) but selecting Polish will not change the displayed content on those pages.
- Conversion of inline ternaries (e.g., RegulatoryIntelligence.tsx's isPl ? "PL string" : "EN string") to t() keys. That is content-level work; deferred to Tier 2.
- Translation of generated AI outputs. The legal_articles corpus, comprehension_tests, prompt corpus, and AI output pipelines remain English-default until Tier 2's content translation work happens.
- Lint rule preventing future hard-coded English strings outside i18n keys. Recommended for Tier 2 to prevent the anti-pattern from continuing while migration happens.
- Per-language pl.json key authoring for the 106 MISSING pages. Each page requires its own translation pass; estimated 3-5 days per page average; multi-month total.

These items are tracked in LANGUAGE_TIER2_REMEDIATION.md when that document is created.

## Tier 2 Forward Reference

Tier 2 is the per-page content translation sub-phase. Scope:

- 106 pages currently without i18n imports
- Inline-ternary cleanup (RegulatoryIntelligence.tsx pattern)
- Lint rule for new strings
- Per-page priority ranking (worker-facing first, admin pages later)
- Translation budget and review cycle
- Tooling for incremental rollout

Tier 2 is NOT in scope for Tier 1 execution. The Tier 2 remediation plan will be created as a separate document after Tier 1 lands and Tier 2 prioritization is decided.
