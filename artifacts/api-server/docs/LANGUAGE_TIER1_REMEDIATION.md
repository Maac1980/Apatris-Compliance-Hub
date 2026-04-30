# LANGUAGE TIER 1 REMEDIATION PLAN

## Frame

This document is the operational companion to the non-negotiable principle "Polish authoritative, English bridge" added to MASTER_PLAN.md at commit 5873fca. The principle is constitutional. This document specifies the foundational fixes (Tier 1) that bring the codebase into structural compliance with the principle.

Tier 1 scope is limited: make the language toggle universally available across all result pages, addressing the four foundational defects identified in the language toggle verification report at commit 41dedd1. Tier 1 does NOT include per-page content translation across the 106 pages currently without i18n -- that is Tier 2, a multi-month sub-phase tracked separately.

Tier 1 estimate: 6-9 hours of focused work.

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

Tier 1 status: **COMPLETE** as of Phase 8 (2026-04-30). All five sub-tasks landed in code; documentation closed via `LANGUAGE_TOGGLE_VERIFICATION_v2.md` (in same directory).

Sub-task implementation commits:
- Sub-task 1: `035acb8` (Phase 3, dashboard `LanguageToggle` extraction)
- Sub-task 2: `f2e77d0` (Phase 4, dashboard AppShell mount)
- Sub-task 3: `89b5abd` (Phase 5b-1, workforce-app `LanguageToggle` with `compact?: boolean` prop; Option 5B-1 architectural adaptation per Phase 5 V4 STOP gates)
- Sub-task 4: `52e064f` + `e0d668f` (Phase 6 Part 2a 23 missing keys + Phase 6 Part 2b EN→PL flip)
- Sub-task 5: `f7262a5` (Phase 7 Part 2 Shape A, `ImmigrationSearch.tsx` reconciliation)

All seven acceptance criteria (below) MET. See `LANGUAGE_TOGGLE_VERIFICATION_v2.md` Section 2 for per-criterion evidence.

### Original planning record (preserved for historical reference)

Tier 1 status: planned, not started.

Tier 1 scope: four sub-tasks addressing the four foundational defects in the verification report. Sub-tasks 1-3 are straightforward extractions and mounts. Sub-task 4 (EN-to-PL default flip) carries a chicken-and-egg analysis and requires a design decision before execution.

Tier 1 estimate: 6-9 hours of focused work, decomposed:
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

## Sub-task 3 -- Workforce-app LanguageToggle (REFRAMED 2026-04-28)

**Erratum reference:** The original framing of this sub-task was based on the verification report's incorrect claim that workforce-app had no toggle UI. See LANGUAGE_TOGGLE_VERIFICATION.md erratum (commit 3a0f5e4) for correction.

**Reality:** A working language toggle exists in `artifacts/workforce-app/src/components/tabs/ProfileTab.tsx` lines 287-317 (added in commit 90800f0, 2026-03-27). The toggle calls `i18n.changeLanguage(lang)` and persists to `localStorage` as `wf_lang`.

**Decision: Option 3B -- Extract and elevate**

Sub-task 3 work:
1. Create `artifacts/workforce-app/src/components/LanguageToggle.tsx` as a shared component
2. Move toggle logic and UI from ProfileTab.tsx (lines 287-317) into the new shared component
3. Mount the shared component in workforce-app's AppShell (currently 11-line pass-through; will become ~40-line layout)
4. Update ProfileTab.tsx to either reference the shared component OR remove its inline toggle (since AppShell now provides it)

**Estimate:** ~45-60 minutes

**Why Option 3B over 3A or 3C:**
- 3B preserves symmetry with dashboard (both apps will have `components/LanguageToggle.tsx` mounted at AppShell level)
- 3B improves discoverability (toggle visible from any tab, not just Profile)
- 3B prepares for Tier 2 work (single canonical component to enhance)
- 3A is acceptable but creates two toggle implementations to maintain
- 3C is the cheapest (~0 minutes) but leaves ProfileTab as the only entry point for language switching, which violates the discoverability principle of putting language controls at AppShell level (matching dashboard pattern)

## Sub-task 4 -- EN-to-PL Default Flip Decision (with CHECK 9 pre-flip)

**CHECK 9 -- pl.json key inventory before flip (ADDED 2026-04-28)**

Before flipping the workforce-app default language to Polish, verify that `artifacts/workforce-app/src/locales/pl.json` has Polish translations for every `t()` call site across the 16 i18n-using files. If pl.json is incomplete, PL-default users will see English fallback strings (per i18next `fallbackLng: "en"`), partially defeating the flip's intent.

**CHECK 9 procedure:**
1. Grep all `t("...")` and `t('...')` and `i18n.t(...)` calls across all 16 workforce-app files (App.tsx, BottomNav.tsx, DashboardPage.tsx, T1-T5 home tabs, Profile, Contract, Docs, GpsCheckin, Payroll, Sites, Timesheet, Workers, Alerts)
2. Build a sorted unique list of i18n keys used
3. Read `artifacts/workforce-app/src/locales/pl.json` and extract its keys
4. Diff: report any keys used in code but missing from pl.json
5. If missing keys found:
   - Decide: (a) author missing Polish strings now (adds time to Sub-task 4), or (b) defer the flip with documented gap, or (c) accept fallback-to-English for missing keys with explicit acknowledgment in the commit message
   - Manish decides

**Estimate for CHECK 9:** ~30 minutes (grep + diff + decide)

**Sub-task 4 main work (after CHECK 9 passes or is resolved):**

Change in `artifacts/workforce-app/src/lib/i18n.ts` line 6:

- localStorage.getItem("wf_lang") || "en"
+ localStorage.getItem("wf_lang") || "pl"

This is a single-line change. Existing users with `wf_lang` already in localStorage retain their saved preference (the `||` short-circuits); only new users get PL default.

**Estimate for the flip itself:** ~5 minutes

## Sub-task 5 -- ImmigrationSearch local-state full reconciliation (ADDED 2026-04-28)

**Context:** During Tier 1 pre-execution audit, surfaced two related concerns in `artifacts/apatris-dashboard/src/pages/ImmigrationSearch.tsx`:

1. Lines 33, 39: `useState<"en" | "pl">(isPl ? "pl" : "en")` -- a local copy of `i18n.language`. Toggling here doesn't sync to the i18next global instance. The verification report flagged ImmigrationSearch as PARTIAL-FUNCTIONAL.

2. Line 40 (and possibly elsewhere): `isPl` anti-pattern -- inline local language state divergence from i18next global. Same root cause as concern (1), expressed differently.

**Why include in Tier 1:** Adjacent work to Sub-task 1 (LanguageToggle extraction) -- context is loaded; reconciling now is cheaper than addressing it during Tier 2's multi-month timeline. Both concerns are in the same file, both are local-state-vs-global-state divergence, one commit covers the full reconciliation.

**Sub-task 5 work:**
1. Remove the local `useState<"en" | "pl">` in ImmigrationSearch.tsx (lines 33, 39)
2. Remove or replace the `isPl` anti-pattern at line 40 (and any other isPl occurrences in the file) with `useTranslation()` hook usage and `i18n.language` reads
3. Replace local `setLanguage` calls with `i18n.changeLanguage()` directly
4. Verify ImmigrationSearch now responds to global toggle changes (manual smoke test in dev)
5. Confirm no other `isPl` or local language-state patterns remain in the file

**Estimate:** ~30-45 minutes (covers full file reconciliation)

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
