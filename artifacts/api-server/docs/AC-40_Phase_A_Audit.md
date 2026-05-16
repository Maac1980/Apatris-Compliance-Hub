# AC-40 Phase A Audit — Worker Help Tab AI Assistant + Categorized Issues

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW (base chat GREEN-functional; substantial improvements gated on AC-46 + AC-44 + AC-43)
**HEAD at audit:** `6b95696`
**Scope:** Read-only feature-by-feature audit of `MessagingTab.tsx` + `/api/messages/*` + `messages` + `message_threads` tables against vision Section 5. Cross-AC overlap analysis with AC-46 + AC-44 + AC-43. Mirrors AC-31 / AC-38 / AC-47 / AC-39 Phase A pattern.

---

## Current state summary

**MessagingTab is fully functional today** as a 2-pane worker-coordinator chat. A worker can see threads, open one, view messages, send replies. The backend supports thread creation, message send, read marking, unread count — all encrypted at rest (XOR encoding).

**But the Help tab vision is much larger than chat.** Vision Section 5 specs: categorized issue reporting + complaint submission + anonymous option + case ID/status tracking + internal assignment + escalation + voice notes + multilingual AI assistant + AI classification. **Of these 9 vision features, 1 ships (chat), 8 are net-new.** Most net-new features require data layers, classification services, and worker-facing AI frameworks that belong to other ACs (AC-46, AC-44, AC-43).

This makes AC-40 **structurally a thin frontend layer** over AC-46/AC-44/AC-43 backends. AC-40 Phase B has a small ungated tail (polish work) and a large gated body waiting on three downstream ACs.

---

## Per-feature inventory (against vision Section 5)

| Vision feature | Built | Partial | New build | Existing surface | Notes |
|---|---|---|---|---|---|
| Chat with coordinator/office | ✓ FULL | — | — | MessagingTab.tsx (104 lines, 2-pane) + messaging.ts (5 routes) + messages + message_threads tables | encrypted at rest; 5s polling; unread tracking |
| Voice note support | — | — | new (audio record + upload + storage + playback) | none | overlaps WU-8 file attachment |
| Categorized issue reporting (payroll / accommodation / transport / supervisor / legal-doc) | — | — | schema column + picker UX + filter | none | **gated on AC-46** schema |
| Complaint submission | partial | text via message works | dedicated complaint UX + structured schema | none | **gated on AC-46** |
| Anonymous option for sensitive complaints | — | — | schema flag + UX toggle + route logic to suppress identity | none | **gated on AC-46** + policy decision (Yulia) |
| Case ID + status tracking | — | — | schema (case_id, case_status) + UX + linking | none | **gated on AC-46** |
| Internal assignment + escalation rules | — | — | schema (assigned_to, escalation_rules) + service + admin UX | none | **gated on AC-46** (engine) |
| Multilingual AI assistant | — | — | endpoint + UX + Anthropic Claude integration + worker-facing AI safety design | none | **gated on AC-43** (worker-facing AI framework) |
| AI classification of issue type / urgency / routing | — | — | classification service + integration with submit flow | none | **gated on AC-44** (internal AI orchestration) |

**Plus implicit gaps surfaced during read:**

| Implicit gap | Surface | Notes |
|---|---|---|
| i18n missing on MessagingTab | hardcoded English: "Messages", "No messages", "Message..." | small — ungated |
| `receiverId` derivation bug | MessagingTab.tsx:64 + 66 — `names[1] || "unknown"` — assumes participant order; will misroute if names aren't [self, other] | actual bug — ungated, fast fix |
| 5-second polling vs push/WebSocket | MessagingTab.tsx:31 `refetchInterval: 5000` — battery + bandwidth cost | design decision — ungated |
| No file/photo attachment in messages | message has only `text` content | overlaps voice notes (WU-8) |
| No message search across threads | no search UX | small-medium — ungated |
| Encryption is XOR not crypto-grade | messaging.ts:30 `legacyXorDecrypt` — security audit-flag, not Phase A scope | **flag for separate security audit** |

---

## Tier breakdown

**Tier 1 — built, working, no improvement needed (1 feature):**
- Chat with coordinator/office (full thread + send + receive + unread + encrypted-at-rest)

**Tier 2 — built, needs polish (1 feature):**
- Complaint submission — text via message works, needs structured surface

**Tier 3 — schema/route exists, frontend missing:**
- None. All gaps are full-stack.

**Tier 4 — net-new (7 features + 6 implicit gaps):**
- Voice notes, categorized issues, anonymous option, case ID/status, escalation, AI assistant, AI classification
- Implicit: i18n, bug fix, polling decision, attachments, search, encryption upgrade

---

## Cross-AC overlap analysis (the structural finding)

AC-40 is not standalone. The substantial vision features depend on three downstream ACs:

### AC-46 (Worker issue / complaint engine) — data-layer parent

**Boundary:** AC-40 owns the worker-facing **frontend surface** (Help tab UX: form, picker, AI chat input, history display). AC-46 owns the **data layer + workflow** (issue schema, case_status states, escalation rules, assignment routing).

**5 of 9 vision features cannot ship in AC-40 Phase B without AC-46 data layer existing first:**
- Categorized issues (needs AC-46 category enum)
- Complaint submission structured form (needs AC-46 complaint schema)
- Anonymous option (needs AC-46 schema flag)
- Case ID/status tracking (needs AC-46 case workflow)
- Internal assignment/escalation (needs AC-46 engine)

**Dependency loop risk:** AC-46 stub says "Upstream gate: AC-31 Phase B + AC-40 (Help tab AI assistant)." AC-40 (this audit) says half its features are "gated on AC-46." **Resolution:** AC-46 Phase B should ship the data layer (schema + service routes) FIRST, then AC-40 Phase B consumes it, then AC-46 Phase B finishes the engine layer (escalation rules, assignment). Sequence AC-46 in two waves rather than one.

### AC-44 (Internal AI orchestration) — classification service parent

**Boundary:** AI classification of issue type/urgency/routing is owned by AC-44 as a service. AC-40 calls the service from the submit flow; doesn't own the classification logic.

**1 vision feature gated:** AI classification of issue. AC-40 cannot implement it without AC-44 classifier existing.

### AC-43 (Worker-facing proactive AI) — framework parent

**Boundary:** The multilingual AI chat assistant feature is worker-facing AI. AC-43 establishes the GDPR consent path + channel decision + worker-facing AI safety design framework. AC-40 cannot ship the AI assistant without AC-43 framework existing.

**1 vision feature gated:** Multilingual AI assistant. Cannot proceed before AC-43 Phase A clarifies safety design + consent flow.

### Summary of AC-40 Phase B gating

| Phase B work | Gated on |
|---|---|
| 3 ungated polish work units (i18n, bug fix, polling decision) | nothing — ship Day 31+ |
| 5 categorization / case / anonymous / escalation features | **AC-46 Phase B data layer** |
| 1 AI classification feature | **AC-44 Phase B service** |
| 1 multilingual AI assistant feature | **AC-43 Phase A framework decisions** |
| 1 voice note feature | shared with WU-8 file attachment; can be ungated technically but operator-priority should drive |

---

## Phase B effort scope (work units, not hours)

Per CLAUDE.md doctrine — scope as work units, not clock time:

**Ungated tail — ship Day 31+ as small atomic commits:**

- **WU-1** — i18n sweep on MessagingTab (hardcoded strings → t() calls with `en.json` + `pl.json` entries, proper Polish diacritics)
- **WU-2** — Fix `receiverId` derivation bug (MessagingTab.tsx:64 + 66 — derive from thread participants rather than positional `names[1]`)
- **WU-3** — Polling vs push decision + implement chosen path (5s polling is battery-costly at scale; push subscription infra exists per `push_subscriptions` table)
- **WU-4** — Message search across threads (ungated, small)

**AC-46-gated body — wait for AC-46 Phase B data layer:**

- **WU-5** — Add `category` enum + picker UX + filter view (consumes AC-46 categorized_issues schema)
- **WU-6** — Issue submission structured form (consumes AC-46 complaint endpoint)
- **WU-7** — Anonymous option toggle + identity suppression (consumes AC-46 anonymous flag)
- **WU-8** — Case ID display + case status badge + link to case detail (consumes AC-46 case workflow)
- **WU-9** — Attachment UX for voice notes + photos + files (consumes AC-46 attachments table)

**AC-44-gated:**

- **WU-10** — AI classification call on submit + show classified category/urgency in admin view (consumes AC-44 classifier)

**AC-43-gated:**

- **WU-11** — Multilingual AI chat assistant UX + endpoint (consumes AC-43 worker-facing AI framework)

**Cumulative AC-40 Phase B scope:** ~11 work units. **Most blocked on downstream ACs.** Ungated tail is 4 work units that can ship as small commits between bigger workstreams.

---

## Verdict reasoning: YELLOW

**Why not GREEN:** even the ungated tail (4 work units) is incremental polish — doesn't deliver the Help-tab vision; just makes the existing chat better. The substantial vision (categorized issues, case tracking, AI classification, multilingual assistant) requires data layers + services + frameworks that belong to AC-46 / AC-44 / AC-43.

**Why not RED:** the existing MessagingTab is solid; backend is wired; encryption + threads + unread + 5 routes all work. Foundation doesn't need rebuild. The work is composition + extension across AC boundaries, not greenfield.

YELLOW captures: small ungated work ships now; everything substantial waits on dependency resolution.

---

## Phase B gating rule

**AC-40 Phase B is split-gated:**

- **WU-1 through WU-4** — UNGATED. Ship Day 31+ in any order between other workstreams.
- **WU-5 through WU-9** — gated on **AC-46 Phase B data layer** (schema + complaint/issue routes). AC-46 Phase B should ship data layer FIRST as a separable wave.
- **WU-10** — gated on **AC-44 Phase B** (internal AI classification service).
- **WU-11** — gated on **AC-43 Phase A** (worker-facing AI framework decisions) + Phase B (consent + channel + AI safety design).

---

## Phase B sequencing rule

1. **Ungated tail first** (WU-1 → WU-2 → WU-3 → WU-4) — atomic per-improvement commits. Quick wins.
2. **AC-46 Phase B kickoff** — when it starts, sequence data layer (categorized_issues schema + complaint routes + anonymous flag + case workflow) BEFORE engine layer (escalation rules + assignment). The data-layer wave unblocks AC-40 WU-5-9.
3. **AC-40 WU-5 through WU-9** — sequence once AC-46 data layer is live. Each work unit is one atomic commit consuming a specific AC-46 surface.
4. **WU-10** — after AC-44 Phase B classifier ships.
5. **WU-11** — after AC-43 Phase A framework + AC-43 Phase B worker-facing-AI design discipline establishes.

One commit per work unit; smoke-validate after each.

---

## Phase B first-action checklist (per work unit)

Same discipline as AC-31 / AC-38 / AC-47 / AC-39 Phase A:

1. Re-read `MessagingTab.tsx` + relevant route handler before any edit.
2. Verify schema column existence with `grep` against init-db.ts before assuming.
3. For i18n: add keys to BOTH `en.json` and `pl.json`; use proper Polish diacritics (ł, ą, ę, ż, ó, ś, ć, ń, ź); follow V3 convention search pattern per CLAUDE.md Bilingual Architecture.
4. For bug fix (WU-2): test the actual misroute scenario before changing the line — confirm receiverId is wrong and not just looking-wrong.
5. For push decision (WU-3): grep `push_subscriptions` table + `push.ts` route file to map existing push infrastructure before designing.
6. For AC-46-gated work: do NOT start until AC-46 Phase B data layer is in production — verify via `flyctl releases` + curl test against the new endpoint.

---

## Anti-hallucination caveats

- **"MessagingTab is fully functional"** — verified by reading the 104-line component end-to-end. Thread list + detail + send + polling + unread + empty state all wired.
- **"5 backend routes"** — verified by reading messaging.ts:37, 56, 100, 124, 134. Each handler body NOT deep-audited; role gating (any authenticated user can access — same pattern flagged in AC-39 audit for /leave admin routes) not deeply reviewed.
- **"Encryption is XOR not crypto-grade"** — verified by reading messaging.ts:30 `legacyXorDecrypt`. The encryption-at-rest claim is technically true (data is not plaintext in DB) but XOR is not modern crypto. Surfaced as security-audit flag, not AC-40 scope.
- **"Cross-AC overlap" analysis** is logical decomposition based on AC stub language + my read of the vision; not verified against AC-46 / AC-44 / AC-43 Phase A audits (those don't exist yet). When those Phase A audits land, this AC-40 audit's gating claims should be cross-checked.
- **`receiverId` derivation bug** is highly likely (`names[1] || "unknown"` assumes participant order) but NOT verified via runtime test. Phase B WU-2 first action confirms by sending a message and tracing the routed receiverId.
- **Work-unit counts** are scoping, not commitment. Real per-work-unit scope confirmed at per-commit kickoff.
- **Polish diacritics applicable** for i18n work — preserved from CLAUDE.md Bilingual Architecture section.

---

## Status

- **Phase A:** complete (this document).
- **Phase B:** **split-gated.** 4 ungated polish work units shippable Day 31+. 7 gated work units waiting on AC-46 (5), AC-44 (1), AC-43 (1).
- **Recommended Day 31+ posture:** AC-40 WU-1/2/3/4 are atomic small commits that can interleave with other workstreams. Substantial Help-tab vision delivery requires AC-46 Phase B to ship first.
- **Cross-AC awareness:** dependency loop with AC-46 resolved by sequencing AC-46 Phase B in two waves (data layer first, engine layer second).
- **Separate security audit flag:** `legacyXorDecrypt` encryption; admin routes role-gating gap (carries over from AC-39 audit finding).

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
