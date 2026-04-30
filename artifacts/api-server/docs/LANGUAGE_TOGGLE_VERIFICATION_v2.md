# LANGUAGE TOGGLE VERIFICATION REPORT — v2

## Section 1 — Document Purpose

This document is the truthful current-state successor to `LANGUAGE_TOGGLE_VERIFICATION.md` (v1, commit `41dedd1`, written 2026-04-26). The original v1 made several claims about the bilingual state of the APATRIS codebase that turned out to have drift between assertion and reality. The drift was first identified in the Phase 1 erratum (commit `3a0f5e4`, 2026-04-28) appended to v1 in-place. v2 supersedes both v1 and the erratum, capturing what is actually true after the Tier 1 bilingual remediation completed across Day 11–12 of the build.

v2 exists because acceptance criterion #7 of `LANGUAGE_TIER1_REMEDIATION.md` (commit `7e6fa97`, reconciled at `cad446a`) requires it: "Tier 1 is not considered complete until the re-verification report is saved to the repository." Until this commit, the criterion was unmet and Tier 1 was, by its own definition, incomplete. With this commit, criterion #7 is met and Tier 1 closes.

The remediation work spans 8 implementation commits (Phase 1 through Phase 7 Part 2 Shape A) plus this Phase 8 documentation closure:

- `3a0f5e4` — Phase 1 erratum
- `cad446a` — Phase 2 reconciliation
- `035acb8` — Phase 3 dashboard `LanguageToggle` extraction (Sub-task 1)
- `f2e77d0` — Phase 4 dashboard AppShell mount (Sub-task 2)
- `89b5abd` — Phase 5b-1 workforce-app `LanguageToggle` with compact prop (Sub-task 3)
- `52e064f` — Phase 6 Part 2a (23 missing keys authored)
- `e0d668f` — Phase 6 Part 2b workforce-app EN→PL flip (Sub-task 4)
- `f7262a5` — Phase 7 Part 2 Shape A `ImmigrationSearch.tsx` reconciliation (Sub-task 5)
- this commit — Phase 8 documentation closure

The work followed the three-intelligences pattern that has organized this build: chat-Claude proposed structure, Holmes reviewed save prompts twice (once at draft, once before APATRIS Claude executed), APATRIS Claude executed against the actual repo state and surfaced architectural mismatches via STOP gates, Manish made decisions at every fork (sub-option choices, layout dependency resolutions, translation refinements). v2 reflects the convergent output of that pattern across all 8 phases.

---

## Section 2 — Tier 1 Acceptance Criteria with Status

`LANGUAGE_TIER1_REMEDIATION.md` defines seven acceptance criteria. Each is now scored.

**1. Canonical LanguageToggle component lives at `artifacts/apatris-dashboard/src/components/LanguageToggle.tsx` (extracted from Dashboard.tsx).**
✓ MET. Created in Phase 3 (commit `035acb8`). Currently 39 lines, default-exports a function component using `useTranslation` from `react-i18next`. Dashboard.tsx no longer contains a private `function LanguageToggle()`.

**2. Dashboard's AppShell.tsx renders the LanguageToggle in the header.**
✓ MET. Phase 4 (commit `f2e77d0`) added `import LanguageToggle from "@/components/LanguageToggle"` to AppShell.tsx and rendered `<LanguageToggle />` at placement P1 — between the active-section indicator and the user-controls cluster (avatar + identity + logout). Phase 4 also performed atomic dead-import cleanup, removing the now-unused import line in Dashboard.tsx alongside the JSX usage being replaced by the AppShell mount.

**3. Every dashboard result page inherits the toggle via AppShell (spot-check of 10 pages from the v1 MISSING list).**
✓ MET. App.tsx wraps the entire `<Router />` in a single `<AppShell>` (App.tsx:514), so every authenticated route inherits the AppShell-mounted toggle automatically. AppShell's conditional `if (!showShell) return <>{children}</>` (AppShell.tsx:263) correctly excludes pre-auth and public routes (`/login`, `/apply`, `/apply/*`, `/worker-upload/*`, `/pricing`). Coverage is structural rather than per-page-tested: ~80+ ProtectedRoute-wrapped pages all inherit the toggle.

**4. Workforce-app has equivalent LanguageToggle component at `artifacts/workforce-app/src/components/LanguageToggle.tsx`.**
✓ MET. Created in Phase 5b-1 (commit `89b5abd`). Currently 81 lines, default-exports a function component with a `compact?: boolean` prop variant. Two render branches: a compact pill for tight headers (DashboardPage premium-header) and a full settings card for ProfileTab. Imports `useTranslation`, `Globe` (`lucide-react`), and `cn` (`@/lib/utils`).

**5. Workforce-app's AppShell or layout component renders the toggle.**
✓ MET — with an architectural adaptation. Workforce-app's `AppShell.tsx` is an 11-line pass-through with the explicit comment "AppShell is a simple pass-through. All layout (phone frame, scroll, nav) is handled by DashboardPage and LoginPage directly. No extra wrappers." Mounting in AppShell would have stacked two header bars on `/dashboard` (a regression). Per Phase 5 V4 STOP gate and Manish's Option 5B authorization, the toggle is mounted in `DashboardPage.tsx`'s premium-header (lines 446–457) immediately to the left of the LogOut button. ProfileTab.tsx retains the toggle inside its settings card (default variant) for tab-level access redundancy.

**6. Sub-task 4 EN-to-PL default flip decision is recorded; flip executed per the selected sub-option.**
✓ MET. Sub-option C selected: workforce-app default flips to PL; dashboard default stays EN until Tier 2. Phase 6 Part 2a (commit `52e064f`) preconditioned the flip by authoring 23 missing translation keys (with four V3-driven Polish-convention adjustments). Phase 6 Part 2b (commit `e0d668f`) executed the flip via a single-line change to `artifacts/workforce-app/src/lib/i18n.ts:6`: `localStorage.getItem("wf_lang") || "en"` → `|| "pl"`. `fallbackLng: "en"` preserved as defensive anti-regression.

**7. Re-verification pass produces an updated verification report (`LANGUAGE_TOGGLE_VERIFICATION_v2.md` or similar) that captures the post-Tier-1 state.**
✓ MET as of this commit. This document is that report.

All seven criteria are MET. Zero DEFERRED. Zero UNMET.

---

## Section 3 — Architecture Current State

### 3.1 Dashboard bilingual architecture

**i18n configuration** lives at `artifacts/apatris-dashboard/src/i18n.ts` (note: directly under `src/`, not `src/lib/`). 27 lines. Default language: English (`lng: savedLang || "en"`, line 16). `fallbackLng: "en"` (line 17). localStorage key `apatris_lang` (line 7). Resources loaded as `{ en: { translation: en }, pl: { translation: pl } }` from `./locales/en.json` and `./locales/pl.json`. `defaultNS: "translation"`. `interpolation.escapeValue: false`. `react.useSuspense: false`.

**Canonical LanguageToggle component** lives at `artifacts/apatris-dashboard/src/components/LanguageToggle.tsx` (39 lines). Reads current language via `useTranslation`'s `i18n.language?.startsWith("pl")` predicate, exposes a `toggle(lang)` handler that calls `i18n.changeLanguage(lang)`. Renders two buttons styled with flag glyphs (🇬🇧 EN, 🇵🇱 PL) inside a pill container with primary-red active-state styling matching dashboard's color palette.

**AppShell mount** at `artifacts/apatris-dashboard/src/components/AppShell.tsx` (499 lines). The toggle is rendered inside the right-side `app-top-right` cluster, between the active-section badge and the user-controls cluster (`<LanguageToggle />`, single import, single JSX usage). Mounted globally for every authenticated route.

**Translation namespaces** in `artifacts/apatris-dashboard/src/locales/`:
- `en.json` — 243 keys across 19 namespaces. Includes the new `immigrationSearch` namespace added in Phase 7 (9 keys: title, subtitle, searchButton, searchPlaceholder, history, recentSearches, searchingDatabases, analyzingSources, popularQuestions).
- `pl.json` — 292 keys across 23 namespaces. Same `immigrationSearch` namespace with proper Polish diacritics (e.g., "Wyszukiwarka Imigracyjna", "Przeszukuj polskie prawo imigracyjne i przepisy dotyczące pracy").

**ImmigrationSearch.tsx** (post-Phase-7, 400 lines) is now canonical-i18n: imports `useTranslation` and destructures `{ t, i18n }`. UI text routes through `t("immigrationSearch.X")`. Data-content language selection (popular questions API result with `{ en, pl }` fields) reads from `i18n.language?.startsWith("pl")` directly. The API request body's `language` field uses an explicit ternary (`i18n.language?.startsWith("pl") ? "pl" : "en"`) to preserve the backend contract that expects exact "en" / "pl" codes rather than full locale strings.

### 3.2 Workforce-app bilingual architecture

**i18n configuration** at `artifacts/workforce-app/src/lib/i18n.ts` (21 lines). Default language: **Polish** as of Phase 6 Part 2b (`localStorage.getItem("wf_lang") || "pl"`, line 6). `fallbackLng: "en"` preserved (line 14). localStorage key `wf_lang` (line 6). Resources loaded as `{ en: { translation: en }, pl: { translation: pl } }` from `@/locales/en.json` and `@/locales/pl.json`.

**Canonical LanguageToggle component** at `artifacts/workforce-app/src/components/LanguageToggle.tsx` (81 lines). Default-exports a function component with a `compact?: boolean` prop (default `false`). Shared state: `currentLang` from `useTranslation`'s `i18n.language`; `switchLanguage(lang)` calls `i18n.changeLanguage(lang)` and writes `localStorage.setItem("wf_lang", lang)`. Two render branches:
- **Compact branch** (`compact === true`): a header-pill identical in spirit to the dashboard's pattern — `flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-1` with two `text-[10px]` flag buttons. Indigo active-state for EN, red active-state for PL (matching workforce-app's color semantic, distinct from dashboard's primary-red-for-both pattern).
- **Default branch** (`compact === false`): a full settings-card with `premium-card rounded-2xl overflow-hidden` wrapper, Globe icon + "Language" label header, two `flex-1` buttons. Visual identical to the original ProfileTab inline toggle from commit `90800f0`. Indigo and red active-states.

A code comment near top of file documents the localStorage key convention: "wf_lang is workforce-app's localStorage convention for language preference. Do not rename — multiple files reference this key directly."

**AppShell** at `artifacts/workforce-app/src/components/AppShell.tsx` is intentionally an 11-line pass-through. The comment "AppShell is a simple pass-through. All layout (phone frame, scroll, nav) is handled by DashboardPage and LoginPage directly. No extra wrappers." documents the design intent. Phase 5b-1 left this file untouched.

**DashboardPage premium-header compact mount** at `artifacts/workforce-app/src/pages/DashboardPage.tsx` (499 lines). The premium-header (lines 428–457 area) wraps the LogOut button in a flex container with the compact LanguageToggle to its left:
```jsx
<div className="flex items-center gap-2 shrink-0">
  <LanguageToggle compact />
  <button onClick={handleLogout} ...>...</button>
</div>
```
Visual order from left-to-right: `[APATRIS logo · role badge] ... [🇬🇧 EN / 🇵🇱 PL pill] [LogOut]`. The compact pill fits within the 56px (`h-14`) header height.

**ProfileTab.tsx default mount** at `artifacts/workforce-app/src/components/tabs/ProfileTab.tsx` (295 lines). Replaces the inline lines 287–317 implementation from commit `90800f0` with a single `<LanguageToggle />` JSX call (no prop, default settings-card variant). The toggle still appears as a full labeled card in the Profile settings tab; UX behavior preserved.

**Translation namespaces** in `artifacts/workforce-app/src/locales/`:
- `en.json` — 349 keys (326 baseline + 23 added in Phase 6 Part 2a)
- `pl.json` — 366 keys (343 baseline + 23 added in Phase 6 Part 2a)

The 23 added keys distribute across `modules.*` (+2: allWorkforceHours, reviewApproveDocs), `tier4.*` (+5), `tier5.*` (+16) — fixing the call-site bugs surfaced in the CHECK 9 inventory (Phase 6 Part 1) where keys referenced in code existed in NEITHER dictionary.

### 3.3 Color semantics and form-factor distinctions

The two apps are visually distinct on purpose. Dashboard is a desktop tool for bilingual lawyer-operators; workforce-app is a mobile-first PWA for Polish-speaking foreign workers. Their LanguageToggle components reflect that:

- **Dashboard LanguageToggle**: pill button with primary-red active state for both EN and PL. One canonical visual mode. Matches dashboard's primary palette throughout.
- **Workforce-app LanguageToggle**: indigo-EN active state, red-PL active state. Asymmetric color semantic that mirrors the existing settings-card behavior in ProfileTab (where EN button uses `bg-indigo-500/15 text-indigo-400` and PL button uses `bg-red-500/15 text-red-400`). Two visual modes (compact, default) behind a `compact?: boolean` prop.

The form-factor distinction sits inside workforce-app's component:
- DashboardPage premium-header is `h-14` (56px). The compact pill is ~28–32px tall — fits comfortably.
- ProfileTab settings card is unconstrained vertically. The default settings-card style is ~96–100px tall — appropriate to the labeled-card UI of the Profile tab.

The decision to support both visual modes (Option 5B-1) emerged from a Phase 5 V4 STOP gate when chat-Claude's initial assumption that the workforce-app toggle would mount-as-is in AppShell collided with reality (toggle 1.7× taller than premium-header). The `compact?: boolean` prop is the architectural adaptation that resolved the mismatch.

---

## Section 4 — Anti-Patterns Reconciled

### 4.1 ProfileTab.tsx pre-existing canonical implementation

**v1 claim:** "Workforce-app has no canonical toggle implementation at all" (line 85 of v1, commit `41dedd1`, 2026-04-26).

**Reality:** A working language toggle existed in `artifacts/workforce-app/src/components/tabs/ProfileTab.tsx` lines 287–317 since commit `90800f0` (2026-03-27) — 30 days BEFORE the v1 verification report was written. The toggle called `i18n.changeLanguage(lang)`, persisted to `localStorage` as `wf_lang`, and was rendered as one of the bottom-nav tabs in `DashboardPage.tsx`. The pre-existing toggle was missed during v1's scan.

The Phase 1 erratum (commit `3a0f5e4`) corrected the v1 record in-place. Phase 2 (commit `cad446a`) reconciled `LANGUAGE_TIER1_REMEDIATION.md` to reflect the corrected baseline: Sub-task 3 was reframed from "build workforce-app toggle from scratch" to **Option 3B — Extract and elevate**: the existing inline toggle becomes a shared `components/LanguageToggle.tsx`, mounted in AppShell-level locations.

In Phase 5b-1 execution, the architectural reality of workforce-app required two further adaptations:
- **DashboardPage as write target** (Option 5B): AppShell is a documented pass-through; the natural mount location is DashboardPage's existing premium-header, not AppShell.
- **`compact?: boolean` prop** (Option 5B-1): the existing toggle is settings-card-tall (~96–100px) and doesn't fit DashboardPage's `h-14` header. A second compact visual mode was needed.

ProfileTab still renders the toggle inside its settings card (default variant) for tab-level access redundancy. DashboardPage's premium-header renders the compact variant for global access from any tab.

The "wired but unused" v1 description of workforce-app's i18n was also drift: 16 (now 17, after Phase 5 added LanguageToggle.tsx itself) workforce-app files use `useTranslation`, not just one. The widespread i18n adoption was visible in the code but missed in v1's scan.

### 4.2 ImmigrationSearch.tsx isPl reconciliation

**v1 classification:** PARTIAL-FUNCTIONAL with the note "Lines 33, 39: useState<\"en\" | \"pl\">(isPl ? \"pl\" : \"en\") — a local copy of i18n.language. Toggling here doesn't sync to the i18next global instance."

**Phase 7 Part 1 inventory (commit history reference: read-only inventory, no commit)** confirmed and quantified the anti-pattern:
- 8 UI-text isPl ternaries (h1 title, subtitle paragraph, search button, history toggle, recent-searches heading, loading text, loading subtext, popular-questions heading)
- 2 data-content patterns: popular questions select `q.en` / `q.pl` from API response, API request body sends `language` field
- A redundant in-page EN/PL button cluster (lines 137–152) duplicating the AppShell-level toggle mounted in Phase 4
- A dead `isPl` prop drilled into `<StructuredResult>` but never read inside the function body (verified via Phase 7 Part 1 V3 Refinement 2 grep)
- A `language` useState (line 39) that forked `i18n.language` at component mount and evolved independently — the state-divergence root cause

**Phase 7 Part 2 Shape A (commit `f7262a5`)** reconciled all of it in one commit:
- Added `immigrationSearch` namespace with 9 keys to dashboard's `en.json` and `pl.json` (with proper Polish diacritics; two V3 Part C convention adjustments applied: `recentSearches` and `popularQuestions` to title-case matching dashboard's existing pattern like `Lista Płac`, `Alerty Compliance`)
- Replaced the 8 UI-text ternaries with `t("immigrationSearch.X")` calls
- Replaced both popular-questions data-content selections (`language === "en" ? q.en : q.pl`) with `i18n.language?.startsWith("pl") ? q.pl : q.en` (note inverted boolean direction)
- Replaced the API request body parameter with the same explicit ternary so the backend receives exactly "en" or "pl" rather than `i18n.language`'s full locale string (`"en-US"`, `"pl-PL"`) which would break the backend contract
- Removed the `language` useState declaration
- Removed the redundant EN/PL button cluster — coordinated with parent className change `flex items-center justify-between mb-6` → `flex items-center justify-end mb-6` so the History toggle stays right-aligned after the cluster removal (Phase 7 Part 2 Refinement 1 layout dependency, Manish's Option (a) decision)
- Removed the dead `isPl` prop drill from both the JSX call and the function signature
- Removed the `isPl` declaration at line 33
- Updated `useTranslation` destructure from `{ i18n }` to `{ t, i18n }` (still need `i18n` for data-language selection)

The file shrank from 422 lines to 400 lines (-22 lines). Net behavior preserved: same search flow, same results, same popular questions, same backend contract. UX preserved: History toggle remains right-aligned. The anti-pattern is gone.

### 4.3 Workforce-app principle #16 violation closure

**Audit finding (Stage 1, dimension D5):** Principle #16 of `MASTER_PLAN.md` ("Polish authoritative, English bridge") was constitutional but provably violated. Workforce-app's default language was English; new Polish-speaking foreign workers landing on the app saw English UI by default until they navigated to Profile tab and switched.

**Phase 6 Part 2a (commit `52e064f`)** preconditioned the flip by authoring 23 missing translation keys, ensuring no PL-default user would see a literal key string ("tier5.submitting") in production. The 23 keys distribute across `modules.*` (2), `tier4.*` (5), `tier5.*` (16) — concentrated in T4/T5/Manager-tier home tabs. Polish translations were authored with V3 Part B convention search; four chat-Claude proposals were modified based on existing pl.json terminology:
- `modules.allWorkforceHours`: Manish chose "Godziny wszystkich pracowników" matching the dominant `pracownicy` workforce convention over chat-Claude's "Godziny całej załogi"
- `tier5.hoursSubmitted`: "Godziny zgłoszone" (V3 Search 3 strong "zgłoszone" convention in submission contexts)
- `tier5.noDocRecords`: "Brak rejestru dokumentów" (V3 Search 4 "rejestr" convention)
- `tier5.notOnRecord`: "Brak w rejestrze" (matches existing `docs.notOnRecord` exact analog)

**Phase 6 Part 2b (commit `e0d668f`)** executed the flip via a two-character substitution at `artifacts/workforce-app/src/lib/i18n.ts:6`. Existing users with a `wf_lang` localStorage entry retain their preference (the `||` short-circuits). Only new users, users who cleared localStorage, or users on a new device see PL by default. `fallbackLng: "en"` was deliberately preserved as defensive anti-regression — if pl.json ever loses a key in future development, users see English fallback rather than blank UI.

This closes the principle #16 violation at the workforce-app level. Foreign workers without a saved language preference now land on Polish by default, which honors the constitutional intent of the principle.

The dashboard default language stays EN per Sub-option C (`apatris_lang || "en"`). Lawyer-operators are bilingual; the principle's stakes are lower in the dashboard. Tier 2 may revisit this decision systematically.

---

## Section 5 — Documentation Drift Corrections (claim-by-claim)

v1 made several specific claims that drifted from reality. v2 supersedes them claim-by-claim.

**Drift 1 — Workforce-app toggle existence**

- v1 (line 83, 85): "Toggle UI: NONE FOUND in `artifacts/workforce-app/src/`. AppShell is a pass-through. DashboardPage uses `useTranslation()` for `t()` only. No flag buttons, no `changeLanguage` UI." / "So the workforce app has no canonical toggle implementation at all."
- Reality: The toggle existed at `ProfileTab.tsx:287-317` since commit `90800f0` (2026-03-27), 30 days before v1 was written. AppShell is a pass-through by design (`if (!isReady) return null; ... return <>{children}</>`); the toggle did not need to live there.
- v2 supersedes per Section 4.1. Sub-task 3 was reframed from "build from scratch" to "extract and elevate" (Phase 2, commit `cad446a`).

**Drift 2 — Workforce-app i18n adoption breadth**

- v1 (implicit, by silence): suggested workforce-app i18n usage was limited to DashboardPage.
- Reality: 16 workforce-app files used `useTranslation` at the time of v1 (App.tsx, BottomNav.tsx, DashboardPage.tsx, and 13 tab components). Post-Phase-5, 17 files (LanguageToggle.tsx itself added). Widespread, not limited.
- v2 supersedes per Section 3.2 (translation namespace inventory) and Section 4.1.

**Drift 3 — ImmigrationSearch.tsx classification**

- v1 (line 136): "**PARTIAL-FUNCTIONAL** | Lines 33, 39: `useState` + own `[language, setLanguage]` state. Lines 138-150 render EN/PL buttons. Works, but is a separate state from i18next global..."
- Reality: v1's classification was directionally correct but incomplete. The full anti-pattern surface (Phase 7 Part 1 inventory) included 8 UI-text isPl ternaries, 2 data-content patterns, a redundant button cluster, a dead prop drill, and a state-divergence useState. v1 noted the classification but did not enumerate the surface.
- v2 supersedes per Section 4.2. The reconciliation in Phase 7 Part 2 Shape A (commit `f7262a5`) addressed all of it.

**Drift 4 — RegulatoryIntelligence.tsx classification**

- v1 (line 141): "**PARTIAL-BROKEN** | Line 40: `const isPl = i18n.language?.startsWith(\"pl\")` then renders ternary Polish/English strings inline (not via `t()` keys). No toggle UI on page. Inline rendering anti-pattern means maintenance burden grows linearly with content."
- Reality: v1's directional finding was correct. Phase 7 Part 1 inventory cross-reference grep quantified ~17 UI-text ternaries in this file.
- v2 status: Phase 7 scope was kept narrow (Sub-task 5 = ImmigrationSearch only per Manish's option (i) decision). RegulatoryIntelligence.tsx is DEFERRED to Tier 2 with documented scope per Section 6.

**Drift 5 — LegalStatusPanel.tsx**

- v1: not flagged.
- Reality: Phase 7 Part 1 cross-reference grep surfaced one isPl ternary in `LegalStatusPanel.tsx:117-118` (`const isPl = i18n.language === "pl"; const L = (key: string) => isPl ? (PL_LABELS[key] ?? key) : key;`). The pattern is small (single helper) but follows the same anti-pattern family.
- v2 documents per Section 6. DEFERRED to Tier 2.

**Drift 6 — Default-language baseline percentage**

- v1: "0% match Polish-default rendering (i18n defaults to English globally)."
- Reality at v1 time: accurate.
- Post-Tier-1 reality: workforce-app defaults to PL (Phase 6 Part 2b). Dashboard still defaults to EN (Sub-option C). Reality is mixed, not 0%.
- v2 supersedes per Section 3.1 + 3.2 + Section 4.3.

**Drift 7 — "1.7% functional toggle coverage"**

- v1 (line 31, 162): "1.7% of result pages (2 of 115) have a working toggle."
- Reality at v1 time: technically incorrect because ProfileTab.tsx already had a working toggle that v1 missed (workforce-app DashboardPage's bottom-nav Profile tab provided 1-click access to language switching). Add 1 to the numerator: ~2.6% (3 of 115). Still small as a percentage.
- Post-Tier-1 reality: 100% of AppShell-wrapped dashboard pages have toggle access (~80+ routes). 100% of authenticated workforce-app pages have toggle access (premium-header compact + ProfileTab settings-card). Across both apps, structurally ~100% AppShell-or-equivalent coverage.
- v2 supersedes per Section 2 (criterion #3 + #5).

The seven drift corrections cover both substantive content errors (Drifts 1, 2, 4, 5) and quantitative drift (Drifts 6, 7). Drift 3 is partial — v1's directional finding held but the surface was undercounted.

---

## Section 6 — Tier 2 Inputs Deferred

The following items were surfaced during Tier 1 work but explicitly deferred to Tier 2.

**Broader dashboard isPl anti-pattern (2 files):**

- `artifacts/apatris-dashboard/src/pages/RegulatoryIntelligence.tsx` — approximately 17 UI-text isPl ternaries plus inline-string rendering throughout the file. The pattern is identical to the one reconciled in `ImmigrationSearch.tsx`: `const isPl = i18n.language?.startsWith("pl"); ... {isPl ? "Polish" : "English"}`. Reconciliation work (mirror of Phase 7 Part 2 Shape A): create namespace, author keys, replace ternaries with `t()` calls. Estimate: ~60–90 minutes.
- `artifacts/apatris-dashboard/src/components/LegalStatusPanel.tsx` — a single isPl ternary inside an `L()` helper function at lines 117–118. Smaller scope; reconciliation may either inline `t()` calls or evolve `L()` into a thin wrapper around `t()`.

Both surfaced during Phase 7 Part 1 inventory cross-reference grep. Tier 2 dashboard reconciliation will address the broader pattern systematically, ideally with a lint rule preventing future hard-coded English strings outside i18n keys (already named in `LANGUAGE_TIER1_REMEDIATION.md`'s "What Tier 1 Does Not Do" section).

**Dashboard default language reconsideration:**

Dashboard currently defaults to EN per Sub-option C. Tier 2 may revisit. The decision is contingent on per-page content translation progress: flipping the default to PL while many pages remain hard-coded English would produce a confusing half-translated UX. Tier 2's per-page translation queue (106 dashboard pages without `useTranslation` imports per the v1 baseline) would precondition the flip.

**Plural forms support (i18next plural feature):**

Several count-dependent translations would benefit from i18next's plural pluralization (e.g., "1 search" / "2 searches" → "1 wyszukiwanie" / "2 wyszukiwania" / "5 wyszukiwań" — Polish uses three plural forms). The current pl.json has some `_plural` entries (`alerts.restoreResolved` / `alerts.restoreResolved_plural`, `docs.urgentBanner` / `docs.urgentBanner_plural`) but coverage is uneven. Tier 2 would systematize this.

**Comprehensive Polish translation review:**

V3 Part C convention searches in Phase 6 Part 2a and Phase 7 Part 2 operated on specific terminology slices (workforce/team words, submission verbs, record vocabulary, title-case conventions). Comprehensive review of the full 292-key dashboard pl.json and 366-key workforce-app pl.json — including spot-checks for ASCII transliteration, archaic phrasing, regional variations, and tone consistency — is deferred to Tier 2.

**Per-page content translation across the 106 MISSING pages:**

This is the original Tier 2 scope per `LANGUAGE_TIER1_REMEDIATION.md`. 106 dashboard pages have no `useTranslation` imports today and render hard-coded English even when PL is selected. Each page requires individual translation work; estimate per page is 3–5 days; multi-month total. The Tier 2 plan (forthcoming `LANGUAGE_TIER2_REMEDIATION.md`) will prioritize: worker-facing pages first, lawyer-facing operational pages second, admin pages last.

Tier 2's planning artifact is a separate document. Phase 8 closes Tier 1 specifically; it does not author Tier 2's plan.

---

## Section 7 — Phase Index (Day 11–12 Commit Trail)

Nine entries representing the full Tier 1 implementation arc.

**1. Phase 1 — `3a0f5e4` (2026-04-28)** — Erratum to `LANGUAGE_TOGGLE_VERIFICATION.md`. Identified two factual errors in v1: ProfileTab.tsx had a working toggle (commit `90800f0`, 30 days prior); workforce-app i18n adoption was 16 files, not 1. 32 lines added.

**2. Phase 2 — `cad446a` (2026-04-28)** — Reconciled `LANGUAGE_TIER1_REMEDIATION.md` to audit findings. Sub-task 3 reframed to Option 3B (extract and elevate). Sub-task 5 added (ImmigrationSearch reconciliation). CHECK 9 added (pre-flip key inventory). Tier 1 estimate updated 4–8h → 6–9h. 76 lines insertions/deletions.

**3. Phase 3 — `035acb8` (2026-04-29)** — Dashboard `LanguageToggle` extraction from `Dashboard.tsx`. New file `components/LanguageToggle.tsx` (39 lines, default export, `useTranslation` hook). Dashboard.tsx reduced by 39 lines. Sub-task 1 closes.

**4. Phase 4 — `f2e77d0` (2026-04-29)** — Dashboard AppShell mount. Imported and rendered `<LanguageToggle />` at placement P1 in AppShell's right-side cluster. Atomic dead-import cleanup in Dashboard.tsx (the now-unused import line removed alongside the JSX usage). Sub-task 2 closes.

**5. Phase 5b-1 — `89b5abd` (2026-04-29)** — Workforce-app `LanguageToggle` extraction with `compact?: boolean` prop variant. New file `components/LanguageToggle.tsx` (81 lines, two render branches behind compact prop). DashboardPage premium-header compact mount left of LogOut button. ProfileTab.tsx default mount in settings card. Two architectural adaptations from initial chat-Claude assumption: DashboardPage as write target (Option 5B per V4 STOP), `compact?: boolean` prop (Option 5B-1 per second V4 STOP). Sub-task 3 closes.

**6. Phase 6 Part 2a — `52e064f` (2026-04-29)** — 23 missing translation keys authored in workforce-app `en.json` and `pl.json`. Distribution: `modules.*` (+2), `tier4.*` (+5), `tier5.*` (+16). Four V3-driven Polish convention adjustments. Net +52 insertions / -6 deletions across both files.

**7. Phase 6 Part 2b — `e0d668f` (2026-04-29)** — Workforce-app default language EN→PL flip. Single-character substitution at `artifacts/workforce-app/src/lib/i18n.ts:6`. `fallbackLng: "en"` preserved as defensive anti-regression. Sub-task 4 closes. Audit principle #16 violation in workforce-app closes.

**8. Phase 7 Part 2 Shape A — `f7262a5` (2026-04-30)** — `ImmigrationSearch.tsx` isPl reconciliation. Added `immigrationSearch` namespace (9 keys) to dashboard's `en.json` and `pl.json` with proper Polish diacritics and 2 V3-driven title-case adjustments. Replaced 8 UI-text isPl ternaries with `t()` calls. Replaced 2 data-content patterns with `i18n.language` explicit ternary. Coordinated layout fix: parent className `justify-between` → `justify-end` after EN/PL button cluster removal. Removed dead isPl prop drill from `<StructuredResult>`. Removed isPl declaration. Updated `useTranslation` destructure. ImmigrationSearch.tsx 422 → 400 lines (-22 lines). Sub-task 5 closes.

**9. Phase 8 — this commit (2026-04-30)** — `LANGUAGE_TOGGLE_VERIFICATION_v2.md` authored as truthful current-state successor to v1. `LANGUAGE_TIER1_REMEDIATION.md` status updated to COMPLETE. Documentation closure for Tier 1.

---

## Section 8 — Verification Outcomes

19+ structural verification catches across the eight implementation phases plus Phase 8. Pattern discipline reinforcements:

**Three-intelligences pattern across all phases.** chat-Claude proposed structure → Holmes reviewed save prompts at draft and again before APATRIS Claude executed → APATRIS Claude executed against actual repo state and surfaced architectural mismatches via STOP gates → Manish made decisions at every fork. The discipline produced compounding catches that prevented several would-have-been incidents.

**V4 STOP gates surfaced architectural mismatches that chat-Claude could not see from chat side.** Phase 5 had two: (1) workforce-app AppShell is a documented pass-through, mounting in AppShell would stack two header bars; (2) the workforce-app toggle is settings-card-tall (~96–100px) and doesn't fit DashboardPage's `h-14` premium-header. Both led to architectural adaptations (Option 5B, then Option 5B-1) authorized by Manish. Phase 7 Part 2 had a layout dependency catch: removing the EN/PL button cluster required coordinated className change `justify-between` → `justify-end` to preserve the History toggle's right alignment.

**Threshold discipline held.** Phase 5b-1's prompt explicitly noted that two architectural adaptations within a phase is reasonable, but three signals the plan is structurally wrong. Phase 5b-1 stopped at two. No third surfaced during execution.

**Atomic cleanup pattern.** Phase 4's dead-import removal in Dashboard.tsx alongside the JSX-usage removal in the same commit. Phase 7 Part 2's `language` useState removal alongside the `setLanguage` button-cluster removal in the same commit. The pattern resists drift: dead code doesn't accumulate across phases.

**Polish translation authority discipline.** Translation authoring sits with Manish, not chat-Claude. V3 Part C convention searches in Phase 6 Part 2a (workforce-app) and Phase 7 Part 2 (dashboard) catch terminology drift before commit. Six total V3-driven changes from chat-Claude proposals applied across the two phases (4 in 6 Part 2a, 2 in 7 Part 2). Uncertain translations (modules.allWorkforceHours in Phase 6 Part 2a) flagged before commit, awaited Manish review, resolved with Manish's option (c) decision.

**Two-part structure for conditional outcomes.** Phase 6 (CHECK 9) and Phase 7 (ImmigrationSearch reconciliation) used a Part 1 read-only inventory + STOP + Part 2 separate save prompt structure. The structure let Manish review the inventory before committing to a shape (A vs B vs C). Phase 6 Part 1 surfaced the CHECK 9 inversion (vacuous primary concern, 23 call-site bugs as adjacent finding) which led to the Shape A-plus pattern (Phase 6 Part 2a precondition + Phase 6 Part 2b flip).

**Stays-untouched multi-layer protection.** When a phase is supposed to NOT touch a file, the protection lives at multiple layers: V7 (file-existence pre-check), post-write check (file unchanged after edit), hard boundaries (forbidden in prompt), git status (only intended files modified), STOP gate (any deviation halts work). Phase 5b-1 used this for workforce-app AppShell.tsx (must remain byte-identical despite mounting toggle elsewhere).

**Inversion findings are normal.** CHECK 9's primary concern (PL-default users seeing English fallback strings for keys missing from pl.json) was vacuous — every en.json key existed in pl.json. The 23 call-site bugs were adjacent findings: keys referenced in code that existed in NEITHER dictionary, rendering as literal key strings to T4/T5/Manager users. Surfacing the inversion led to the Shape A-plus pattern: precondition the flip with a missing-keys commit (Phase 6 Part 2a), then execute the flip (Phase 6 Part 2b).

**"Wired but unused" pattern resolved.** ImmigrationSearch.tsx imported `useTranslation` solely to read `i18n.language` for the isPl boolean computation. Zero canonical `t()` calls. Phase 7 Part 2 completed the wiring: useTranslation destructure expanded to `{ t, i18n }`, 9 t() calls added, `i18n.language` retained for data-content selection.

**Bidirectional verification class.** Post-write checks include both "new pattern present" greps (count of t() calls, count of i18n.language ternaries) AND "old pattern absent" greps (count of `setLanguage`, count of `isPl`, count of EN/PL button cluster). Phase 7 Part 2 used 11 bidirectional checks. None failed.

**Verification 4 dictionary-completeness preconditioning.** Phase 6 Part 2b's V4 confirmed Phase 6 Part 2a's 23 keys still present before the flip. The flip's no-regression promise depends on dictionary completeness; V4 preconditioned it.

**Phase 8 docs-only discipline.** This phase produces no code changes. Pre-edit and post-edit TypeScript baselines (dashboard 18, workforce-app 15) must be identical. Build sanity must persist.

---

## Section 9 — Future Considerations

The audit's Stage 1 Top 5 priorities, ranked by ROI, with current status:

**1. Tier 1 bilingual remediation** — ✓ COMPLETE as of this commit (Phase 8). All five sub-tasks landed in code (`035acb8`, `f2e77d0`, `89b5abd`, `52e064f` + `e0d668f`, `f7262a5`); documentation closed in this commit. No further action.

**2. Migration ledger** — single biggest remaining ROI fix. The audit identified that schema lives as raw SQL DDL in `lib/init-db.ts` (3,715 lines, 150 CREATE TABLE statements) with no versioned migration history. Idempotent CREATE-IF-NOT-EXISTS is not auditable in Postgres. Schema drift between staging and prod compounds silently. ~1–2 days of work to convert into a numbered migration history with `schema_migrations` table. This addresses the "what state is prod actually in" confusion class. Recommended next.

**3. Update CLAUDE.md to truth** — cheap, high-value. The audit found drift: CLAUDE.md says "100+ endpoints across 27 route files" but actual is 131 route files / 688 endpoints; "25+ tables" but actual is 150; "304 tests" but actual is 497. CLAUDE.md state no longer matches reality post-Tier 1 either (LanguageToggle component locations, ProfileTab structure changed, immigrationSearch namespace added). ~30 minute update. Recommended adjacent to Migration ledger work.

**4. Sentry + pino sweep + CI test gate on push** — production observability hardening. The audit found 298 `console.*` calls across api-server vs only 1 pino import; Sentry barely wired (2 references); 10 rate-limit references across 131 route files; no PR gate on main. Single-author velocity (71 commits / 10 days at audit time) needs a net. ~4–6 hours; fits a single focused day.

**5. Layer 0 v1 decision + execute** — strategic build decision. EU AI Act Article 6 conformity work in `EU_AI_ACT_ARTICLE_6_RESEARCH.md` produced a "likely-not-high-risk, ESTIMATE-medium" verdict with seven counsel-review questions. Layer 0 v1 build is gated on EU AI Act counsel review. Three sub-options (A/B/C) for Polish authoritative content sourcing. Larger architectural commitment than items 2–4.

Adjacent to the audit-derived priorities:

**Counsel engagement** — `COUNSEL_HANDOFF_PACKET.md` is at v1.0 (commit `27ff161`), engagement-ready. Find Polish radca prawny + EU regulatory firm, send packet, unblock legal review of Tekra contract, umowa zlecenia risk, PKD amendment. P-01 in user's top-of-mind tasks at audit time.

**Tier 2 bilingual remediation** — inheritances captured in Section 6: `RegulatoryIntelligence.tsx`, `LegalStatusPanel.tsx`, dashboard default language reconsideration, plural forms, comprehensive Polish translation review, per-page translation across 106 MISSING pages. Plan artifact `LANGUAGE_TIER2_REMEDIATION.md` to be authored as a separate phase.

**Layer 1 case_reference build** — gated on Layer 0 v1 decision and execution. `CHECK_LAYER1_CASE_REFERENCE.md` exists (commit `ed0b31d`) with 7 product decisions queued for Manish.

**Fly deploy decision for Tier 1 work** — separate operational decision; not part of Tier 1 scope. Production deployment of Tier 1 changes (dashboard AppShell mount, workforce-app PL default flip, ImmigrationSearch reconciliation) is the natural follow-up.

---

## Section 10 — Closure Statement

Tier 1 bilingual remediation is COMPLETE.

In code, across Day 11–12 of build:
- `035acb8` Phase 3 (Sub-task 1)
- `f2e77d0` Phase 4 (Sub-task 2)
- `89b5abd` Phase 5b-1 (Sub-task 3)
- `52e064f` + `e0d668f` Phase 6 Part 2a + Part 2b (Sub-task 4)
- `f7262a5` Phase 7 Part 2 Shape A (Sub-task 5)

In documentation, in this commit:
- `LANGUAGE_TOGGLE_VERIFICATION_v2.md` (this document)
- `LANGUAGE_TIER1_REMEDIATION.md` status updated to COMPLETE

Authors. chat-Claude proposed structure. Holmes reviewed save prompts twice (draft and pre-execution). APATRIS Claude executed against the actual repo and surfaced architectural mismatches via STOP gates. Manish made decisions at every fork. The four-layer pattern (chat-Claude DRAFT → Holmes review → save prompt → Holmes second review → APATRIS Claude execute) held across all eight implementation phases plus this docs phase.

Audit principle #16 ("Polish authoritative, English bridge") is closed at the structural level for both apps. Workforce-app new users land on Polish by default. ImmigrationSearch.tsx's anti-pattern is reconciled with canonical i18n. The broader dashboard isPl pattern in `RegulatoryIntelligence.tsx` and `LegalStatusPanel.tsx` is documented in Section 6 as Tier 2 inheritance.

Documentation-honesty drift from Audit Stage 1 is closed by Section 5's claim-by-claim corrections of v1.

This concludes Tier 1.
