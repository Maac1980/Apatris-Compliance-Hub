# LANGUAGE TOGGLE VERIFICATION REPORT

## Frame

This document captures the verification of language toggle presence on result pages across the APATRIS codebase. The verification was conducted by APATRIS Claude on 2026-04-26 in response to the bilingual architecture principle articulated as "Polish authoritative, English bridge."

This is a verification report, not a remediation plan. The findings inform the master plan principle update and the remediation work documented in companion documents (LANGUAGE_TIER1_REMEDIATION.md when saved).

Verification scope: 115 result pages identified (112 lawyer-facing dashboard pages, 3 workforce-app pages).

Coverage: 100% of identified result pages received a verification label. For 106 of 115 pages (92%), the verification terminated at the discovery that no i18n implementation exists, producing the MISSING label. The remaining 9 pages (8%) had i18n implementations of varying completeness, which were inspected for toggle presence, default language, and functionality. Zero AMBIGUOUS labels.

Verification methodology: code-reading only. No dev server started, no tests run, no deployed environments accessed. The "functional" check was verified by reading the toggle implementation code and confirming language switching logic is correct, not by executing the code.

## Companion Documents

This verification document references companion documents in the same directory:

- artifacts/api-server/docs/MASTER_PLAN.md (commit f1c0152) -- the directional plan; bilingual principle to be added in a subsequent save
- artifacts/api-server/docs/LAYER_0_DESIGN.md (commit 3e0dead) -- the Layer 0 architectural design
- artifacts/api-server/docs/LAYER_0_TESTABILITY.md (commit 1d10251) -- the Layer 0 comprehension test suite
- artifacts/api-server/docs/EU_AI_ACT_ARTICLE_6_RESEARCH.md (commit bf4d92b) -- the EU AI Act conformity research

Forward references (documents to be saved subsequently):
- LANGUAGE_TIER1_REMEDIATION.md -- the foundational fix plan (toggle availability + EN-default decision); to be created after this verification report and master plan update

## Status Summary

Verification date: 2026-04-26.

Headline finding: the bilingual principle is mostly aspirational, not implemented. 1.7% of result pages (2 of 115) have a working toggle. 0% of pages match Polish-default rendering (i18n defaults to English globally). Approximately 92% of pages (106) have no i18n at all -- English-only hard-coded strings.

Label distribution:
- VERIFIED: 1 page (Dashboard.tsx with caveat: EN default)
- PARTIAL-FUNCTIONAL: 1 page (ImmigrationSearch.tsx -- local state inconsistent with i18next global)
- PARTIAL-BROKEN: 7 pages (i18n imports but no toggle UI; user must navigate away to switch language)
- MISSING: 106 pages (no i18n; hard-coded English)
- AMBIGUOUS: 0

Coverage: 100% of identified result pages received a label. Verification meets the >=80% threshold and supports proceeding to the master plan update.

Foundational defects (not page-specific): four defects identified at the i18n infrastructure level. Documented in the Gaps Summary section.

Recommendation: hybrid Option (a) -- adopt the principle in MASTER_PLAN.md with two-tier qualification. Tier 1 (toggle availability + foundational defaults) is 4-8 hours of focused work. Tier 2 (per-page content translation across 106 pages) is a multi-month sub-phase. Documented in the Recommendations section.

## Canonical Toggle Implementation

### Dashboard app (lawyer-facing)

**File:** `artifacts/apatris-dashboard/src/i18n.ts`
- `lng: savedLang || "en"` (line 16) -- **default is English** (principle violation)
- `fallbackLng: "en"` (line 17)
- localStorage key `apatris_lang` persists user choice
- Resources loaded from `./locales/en.json` and `./locales/pl.json`

**Toggle UI:** `artifacts/apatris-dashboard/src/pages/Dashboard.tsx:78-114`

```tsx
function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith("pl") ? "pl" : "en";
  const toggle = (lang: string) => { i18n.changeLanguage(lang); };
  return (
    <div className="flex items-center gap-1 ...">
      <button onClick={() => toggle("en")}>🇬🇧 EN</button>
      <button onClick={() => toggle("pl")}>🇵🇱 PL</button>
    </div>
  );
}
```

**Critical:** declared as a local `function` (no `export`), not in a shared component file. Cannot be imported by other pages. Functionally correct (calls `i18n.changeLanguage`); structurally siloed.

**AppShell:** `artifacts/apatris-dashboard/src/components/AppShell.tsx` imports `useTranslation` only for `t()` (line 219); does NOT render a toggle UI. So pages wrapped by AppShell do NOT inherit a toggle.

### Workforce app (worker-facing)

**File:** `artifacts/workforce-app/src/lib/i18n.ts`
- Same i18next + react-i18next pattern
- Default `lng: savedLang || "en"` (English default again)
- localStorage key `wf_lang` (different from dashboard's `apatris_lang`)

**Toggle UI:** **NONE FOUND** in `artifacts/workforce-app/src/`. AppShell is a pass-through. DashboardPage uses `useTranslation()` for `t()` only. No flag buttons, no `changeLanguage` UI.

So the workforce app has **no canonical toggle implementation at all**.

## Result Pages Inventory

### Lawyer-facing dashboard pages (mounted routes)

**Total: 112 pages** registered via Wouter `<Route>` declarations in `artifacts/apatris-dashboard/src/App.tsx`. Sample:

| Page | Route | Description | Audience |
|---|---|---|---|
| Dashboard.tsx | `/` | Home: workers list, document expiry chart, alerts | lawyer/admin |
| ImmigrationSearch.tsx | `/immigration-search` | Polish immigration law Q&A | lawyer/admin |
| ComplianceAlerts.tsx | `/compliance-alerts` | Document expiry alerts | lawyer/admin |
| ContractHub.tsx | `/contracts` | Contract management + AI generator | lawyer/admin |
| DocumentWorkflow.tsx | `/doc-workflow` | Upload -> review -> approve flow | lawyer/admin |
| RegulatoryIntelligence.tsx | `/regulatory` | Polish law update monitor | lawyer/admin |
| AnalyticsPage.tsx | `/analytics` | Heatmap + predictive analytics | lawyer/admin |
| GpsTracking.tsx | `/gps-tracking` | Worker GPS check-ins | lawyer/admin |
| Login.tsx | `/login` | Auth | shared |
| LegalCommandCenter.tsx | (routed) | Legal case command | lawyer/admin |
| KnowledgeBase.tsx | (routed) | Legal KB editor + search | lawyer/admin |
| PayrollPage.tsx | (routed) | Payroll grid | lawyer/admin |
| PoARegistry.tsx | (routed) | Power of attorney registry | lawyer/admin |
| RegulatorySourceRegistry.tsx | (routed) | Regulatory source config | lawyer/admin |
| ... ~98 more pages | | (per Explore agent's full inventory) | |

The full set of ~112 pages includes Workers, Hours, Availability, Shifts, Payroll, Invoices, Compliance, Contracts, Documents, Knowledge Base, Legal Brief, Legal Command Center, A1 certificates, PoA registry, GDPR, Audit Logs, GPS, Geofences, Site Coordinators, Tenants, Bench, Job Board, Mood, Voice Check-ins, Skills, Worker Validation, Posted Workers, ESSPASS, Insurance, Housing, Settings, Test Scenarios, System Health, etc.

### Worker-facing workforce-app pages (mounted)

| Page | Route | Description | Audience |
|---|---|---|---|
| LoginPage.tsx | `/` | Worker auth | worker |
| DashboardPage.tsx | `/dashboard` | Role-based worker dashboard with sub-tabs (T1-T5 RBAC) | worker |
| not-found.tsx | `*` | 404 | shared |

**Total: 3 substantive pages** in workforce-app (not-found is technical, not result content).

### Shared

No separate shared-page surface beyond what the two apps each render.

**Combined total: 115 pages** (112 dashboard + 3 workforce).

## Per-Page Toggle Verification

### Dashboard pages with i18n imports (8 of 112)

| Page | Label | Evidence |
|---|---|---|
| `pages/Dashboard.tsx` | **VERIFIED** | Lines 78-114 define `LanguageToggle()` rendered in header. `i18n.changeLanguage` wired. Caveat: defaults to EN (principle violation at the i18n.ts level, not the page level) |
| `pages/ImmigrationSearch.tsx` | **PARTIAL-FUNCTIONAL** | Lines 33, 39: `useTranslation` + own `[language, setLanguage]` state. Lines 138-150 render EN/PL buttons. Works, but is a separate state from i18next global -- toggling here does NOT change i18next global; toggling Dashboard does NOT affect this page's local state. Inconsistent pattern. |
| `pages/AnalyticsPage.tsx` | **PARTIAL-BROKEN** | Imports `useTranslation` for `t()` keys; no toggle UI. User must navigate to `/` (Dashboard) to switch language. |
| `pages/Login.tsx` | **PARTIAL-BROKEN** | Imports `useTranslation` for `t()` keys; no toggle UI. Pre-auth page, but per prompt's "lawyer-only tabs in scope" reading, the toggle should still be present. |
| `pages/ContractHub.tsx` | **PARTIAL-BROKEN** | `useTranslation` for `t()` only; no toggle UI. |
| `pages/DocumentWorkflow.tsx` | **PARTIAL-BROKEN** | `useTranslation` for `t()` only; no toggle UI. |
| `pages/RegulatoryIntelligence.tsx` | **PARTIAL-BROKEN** | Line 40: `const isPl = i18n.language?.startsWith("pl")` then renders ternary Polish/English strings inline (not via `t()` keys). No toggle UI on page. Inline rendering anti-pattern means maintenance burden grows linearly with content. |
| `pages/GpsTracking.tsx` | **PARTIAL-BROKEN** | `useTranslation` for `t()` only; no toggle UI. |

### Dashboard pages with NO i18n at all (104 of 112)

All 104 remaining pages: **MISSING.** No `useTranslation`, no `i18n` imports, no toggle, all content hard-coded English. Examples (not exhaustive):

WorkerUpload, ComplianceAlerts, JobBoard, InvoiceManagement, KnowledgeBase, LegalCommandCenter, LegalGraph, PayrollPage, PoARegistry, RegulatorySourceRegistry, AdminSettings, Wellness, GDPR, AuditLogs, Geofences, SiteCoordinators, Tenants, Bench, Shifts, Hours, Availability, Skills, JobApplications, Onboarding, A1Certificates, PostedWorkers, Insurance, Housing, MoodEntries, VoiceCheckins, BenchPlanning, BillingSubscriptions, ClientPortal, WorkerValidation, Bookings, MarketIntelligence, RevenueForecasts, MarginAnalysis, ROIDashboard, Frameworks, Whitelabel, Esspass, SaasBilling, RegulatoryUpdates, RegulatoryApprovals, RegulatoryReviewTasks, RegulatorySimulations, RegulatoryDeployments, IntelligenceFeed, IntelligenceRouter, IntelligenceStream, KnowledgeGraph, DecisionExplanations, TestScenarios, TestRuns, SystemHealth, SystemTest, SystemMetrics, MosPackage, Notifications, NotificationLog, NotificationsConfig, Reports, ReportSchedules, Translate, ErrorReports, OrgChart, Help, etc.

### Workforce-app pages

| Page | Label | Evidence |
|---|---|---|
| `workforce-app/src/pages/LoginPage.tsx` | **MISSING** | No i18n imports per Explore survey |
| `workforce-app/src/pages/DashboardPage.tsx` | **PARTIAL-BROKEN** | `useTranslation()` at line 96; no toggle UI on page; no AppShell-level toggle either; English-default i18n.ts (`wf_lang`). Worker has no way to switch language. |
| `workforce-app/src/pages/not-found.tsx` | (out of scope -- not a result page per prompt definition) | |

### Combined summary

| Label | Count | Share |
|---|---|---|
| VERIFIED | 1 | 0.9% |
| PARTIAL-FUNCTIONAL | 1 | 0.9% |
| PARTIAL-BROKEN | 7 | 6.1% |
| MISSING | 106 | 92.2% |
| AMBIGUOUS | 0 | 0% |
| **Total** | **115** | **100%** |

## Gaps Summary

### Group 1 -- User-facing problems (PARTIAL-BROKEN: 7 pages)

These pages USE i18n (so content can render in PL when global lang is PL), but the user cannot switch language without leaving the page.

| Page | Gap | Complexity |
|---|---|---|
| `pages/AnalyticsPage.tsx` | No toggle UI | **Simple** (1 line if AppShell-toggle fix is done; 5 lines if per-page) |
| `pages/Login.tsx` | No toggle UI | **Simple** (same) |
| `pages/ContractHub.tsx` | No toggle UI | **Simple** (same) |
| `pages/DocumentWorkflow.tsx` | No toggle UI | **Simple** (same) |
| `pages/RegulatoryIntelligence.tsx` | No toggle UI; uses inline `isPl ? "PL" : "EN"` ternaries instead of `t()` keys | **Moderate** (toggle is simple; converting inline ternaries to `t()` keys is per-string work) |
| `pages/GpsTracking.tsx` | No toggle UI | **Simple** (same) |
| `workforce-app/pages/DashboardPage.tsx` | No toggle UI; workforce-app has no toggle anywhere | **Simple-to-Moderate** (need workforce-app's own AppShell toggle component) |

### Group 2 -- User-facing problems (MISSING: 106 pages)

These pages have NO i18n at all. Even if a global toggle existed, the content stays English because strings are hard-coded.

The fix decomposes into two halves:
- **Half A -- toggle availability**: lifting `LanguageToggle` into `AppShell.tsx` makes it visible on all pages wrapped by AppShell. **Simple, ~1 hour.**
- **Half B -- content translation**: wrapping every hard-coded English string in `t()` and adding Polish translations to `pl.json`. This is the deep work -- **complex, multi-week per page-cluster** (estimated ~3-5 days per page average for substantial pages, less for thin admin pages, possibly months total).

A user toggling to PL on any of these 106 pages would see the toggle work but the content remains English. That's strictly an improvement over today (no toggle), but functionally still incomplete.

### Group 3 -- Code-consistency problems (PARTIAL-FUNCTIONAL: 1 page)

| Page | Gap | Complexity |
|---|---|---|
| `pages/ImmigrationSearch.tsx` | Uses local `[language, setLanguage]` state instead of i18next global. Inconsistent with Dashboard's pattern. Toggling here doesn't sync to global; toggling Dashboard doesn't sync to here. | **Simple-to-Moderate**: replace local state with `i18n.language` reads; remove duplicate state. ~30 min. |

### Foundational defects (not page-specific)

| Defect | Fix | Complexity |
|---|---|---|
| `i18n.ts:16` defaults to EN | Change to `lng: savedLang || "pl"` | **Trivial** (1-line change). May surprise existing users who have no `apatris_lang` saved -- but that's the principle. |
| `LanguageToggle` is private to Dashboard.tsx | Extract to `components/LanguageToggle.tsx`, import into AppShell | **Simple**, ~30 min |
| AppShell does not render the toggle | Add `<LanguageToggle />` to AppShell header | **Simple**, ~5 min after extraction |
| Workforce-app has no toggle UI at all | Build equivalent for workforce-app's AppShell | **Simple**, ~1 hour (mirror pattern) |

## Ambiguities and Unknowns

**No AMBIGUOUS labels.** Every page was classifiable from code reading alone.

**Edge case noted:** the prompt's definition says "If a button opens a page that contains both result content and configuration content, the page counts as a result tab." Several pages (AdminSettings, RegulatorySourceRegistry, Tenants, etc.) blur this line. They're classified as MISSING above. None changed verdict.

**Prompt definition test -- does Login count?** Login is pre-auth and arguably not a result page. Per prompt's "Lawyer-only tabs are still in scope," Login was kept in scope; it's PARTIAL-BROKEN. Removing Login from scope wouldn't move any percentage materially.

**Workforce-app `not-found.tsx`** is excluded as a 404 page (not result content per the definition).

**Possible page locations not surveyed:** The Explore agent surveyed `artifacts/apatris-dashboard/src/pages/` and `artifacts/workforce-app/src/pages/`. Other areas of the codebase that *might* contain page-like surfaces (e.g., `mockup-sandbox/`, embedded views) were not surveyed. These are unlikely to be production result pages, but flagging the boundary honestly.

**Deep-translation reality not tested:** verifying that a page rendered in Polish actually shows full Polish content (vs. partial -- half PL, half EN due to missing `pl.json` keys) was NOT done. That's a content-quality verification beyond the toggle-presence verification scoped here. A page labeled VERIFIED for toggle presence may still produce mixed-language output.

## Recommendations

### Where the principle stands

The principle "Polish authoritative, English bridge" is **conceptually right and operationally absent**. Today's reality:
- 1.7% of pages have a working toggle (2 of 115).
- 0% of pages match the Polish-default principle (default is EN globally).
- ~92% of pages have no localization at all (English-only hard-coded strings).

### The two options framed

**Option (a) -- Adopt the principle now; remediation is a follow-up build sub-phase.**
- Pros: principle is constitutional from day one. Future work explicitly aligned. The audit document (this report) becomes the gap register that drives remediation. Aligns with how Layer 0 was added to the master plan ahead of being built.
- Cons: gap between principle and reality is large (1.7% functional). Reading the master plan, a reader would assume the principle is implemented when it's not. Must add an honest "implementation status" footnote to the principle.

**Option (b) -- Close foundational gaps first; then add the principle.**
- Pros: principle reflects implemented reality. No "constitutional but unbuilt" awkwardness.
- Cons: foundational fix is fast (~half a day for AppShell toggle + EN->PL default), but content translation is a multi-week-to-multi-month sub-phase. If the principle waits for full content migration, it waits forever.

### Recommendation: Hybrid -- Option (a) with a phased remediation plan

Add the principle to MASTER_PLAN.md NOW with a two-tier qualification:

1. **Tier 1 (toggle availability + Polish default) -- must ship within 2 weeks of principle adoption.**
   - Extract `LanguageToggle` from Dashboard.tsx into `components/LanguageToggle.tsx`
   - Mount it in `AppShell.tsx` so every dashboard page inherits it
   - Mirror in workforce-app
   - Flip i18n.ts default from `"en"` to `"pl"` in both apps
   - Total estimate: 4-8 hours of focused work
   - After: 100% of pages have toggle access; default is Polish; principle's structural form is true

2. **Tier 2 (content translation) -- multi-month sub-phase, separately tracked.**
   - 106 hard-coded-English pages need `t()` wrapping + `pl.json` keys
   - Prioritize lawyer-facing pages with high foreign-worker visibility (worker profiles, contracts, status pages)
   - Estimate: multi-month sub-phase
   - Until Tier 2 lands per page, that page renders English even when PL is selected -- but the toggle works and the principle is structurally true

This honors the discipline used throughout the project: principles are constitutional even when implementation lags, but the lag is named and tracked. Pattern matches how Layer 0 was added to MASTER_PLAN.md ahead of v1 build.

### What I would NOT recommend

- Pure Option (b) -- the principle waits for full content migration that may take 6+ months. The current 1.7% reality persists in the meantime. Worse, the principle's intent (worker comprehension of rejection letters etc.) is delayed.
- Pure Option (a) without the phased plan -- risks the principle becoming aspirational decoration. Master plan principles should be enforceable, not decorative.

### Cross-document propagation if Option (a) hybrid is chosen

- `MASTER_PLAN.md` -- add new principle to NON-NEGOTIABLE PRINCIPLES section with Tier 1/Tier 2 qualification
- New doc `artifacts/api-server/docs/LANGUAGE_TIER1_REMEDIATION.md` -- captures the 4-8 hour plan to ship toggle availability and PL default
- New doc `artifacts/api-server/docs/LANGUAGE_TIER2_REMEDIATION.md` (or merged into existing roadmap docs) -- captures the per-page content translation queue
- This research document (saved as `LANGUAGE_TOGGLE_VERIFICATION.md`) becomes the gap register that Tier 1 + Tier 2 docs reference
