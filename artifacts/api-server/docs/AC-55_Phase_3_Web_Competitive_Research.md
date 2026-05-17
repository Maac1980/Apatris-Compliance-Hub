# AC-55 Deep Research — Phase 3: Web Competitive Research

**Date:** Day 31, 2026-05-17
**Scope:** Industry patterns + Polish/EU regulatory requirements for workforce comms
**Phase:** 3 of 3 (Phase 1 APATRIS done at `3bec12e`; Phase 2 EEJ done at `9de9371`)
**Method:** 13 web queries + 4 deep-fetches against authoritative sources; all claims URL-cited inline

---

## Per-target findings

### TARGET 1 — WebSocket vs Push at workforce scale

| Finding | Cited source |
|---|---|
| **Hybrid is the dominant pattern.** Apps use Web Push to re-engage closed/backgrounded users, then open a WebSocket once the app is foregrounded for real-time in-app interaction. | [Curiosum: Mobile Push Notifications vs WebSockets](https://curiosum.com/blog/mobile-push-notifications-description-and-comparison-with-web-sockets) |
| **Web Push wins on battery.** Push delegates delivery to APNS/FCM; modern OSs aggressively batch and suppress wakeups. WebSocket requires persistent TCP per client → drains battery and burns server memory/CPU. | [Mobiloud: Do Push Notifications Really Drain the Battery?](https://www.mobiloud.com/blog/push-notifications-battery), [IEEE: REST and WebSocket energy consumption](https://ieeexplore.ieee.org/document/7340755/) |
| **WebSocket wins for interactive sessions.** Full-duplex bidirectional connection; "real-time chat, gaming, collaboration tools needing low latency and bidirectional data." | [dev.to: WebSocket vs Web Push vs SSE](https://dev.to/ayushsrtv/websocket-vs-web-push-vs-server-sent-events-when-to-use-what-3214) |
| **SSE is the underrated middle ground.** Read-heavy server-to-client updates (live feeds, ticker, notifications when app is open) at lower complexity than WebSocket. | Same dev.to source above |
| **Beekeeper/Workvivo design choices:** mobile-first deskless workers, offline access, push notifications listed as standard primitive. Workvivo acquired by Zoom 2023 — comms layer increasingly bundled with Zoom Workplace primitives (which are WebSocket-based for in-app chat). | [Beekeeper.io](https://www.beekeeper.io/), [Staffbase: top employee apps](https://staffbase.com/blog/best-employee-app) |

**Maps to APATRIS+EEJ gap:** APATRIS has push + polling, no WebSocket. EEJ has WebSocket + WhatsApp, no push. **Industry says use both** — push for asynchronous/closed-app, WebSocket for in-session interaction.

**Recommended approach:** Combine EEJ's WebSocket spine (refine inbound) + APATRIS's push stack (already strong) into hybrid architecture matching industry standard.

---

### TARGET 2 — AI message approval workflows in regulated industries

| Finding | Cited source |
|---|---|
| **Audit trail is a UX requirement, not a backend afterthought.** "Every AI-influenced decision in a regulated context needs a clear record of which human authorized, accepted, or overrode it. That record cannot live only in a database; it has to be structurally visible in the interface." | [Fuselab: AI Design for Regulated Industries](https://fuselabcreative.com/ai-design-regulated-industries/) |
| **3-tier classification is the canonical pattern.** Auto (low-risk, templated) → templated (medium-risk, structured) → approval-required (high-risk, human-in-loop). Mirrors EEJ's `worker_safe / internal_detailed / authority_formal` tier system. | [Domino: AI Automation Challenges in Regulated Industries](https://domino.ai/blog/ai-automation-regulated-industries), [Trussed: AI Workflow Automation Compliance Guide](https://feeds.trussed.ai/blog/ai-workflow-automation-compliance-hipaa-fca-gdpr-finance-healthcare-technology) |
| **Audit logs must record:** AI-driven recommendation, action, approval, rejection, escalation, override. Per-event, not aggregated. | Fuselab source above |
| **Override paths must be first-class.** Workflows that hide the "reject + reroute" button are non-compliant in regulated UX. | Fuselab source above |
| **2026 regulatory acceleration:** 1,561 AI-related bills introduced across 45 US states by March 2026 (145.8% increase from 2024). SR 26-2 in April 2026 adopted principles-based framework replacing annual revalidation with risk-based cadences. | [OneReach: AI Governance Frameworks 2026](https://onereach.ai/blog/ai-governance-frameworks-best-practices/), [Wilson Sonsini: 2026 AI Regulatory Year-in-Preview](https://www.wsgr.com/en/insights/2026-year-in-preview-ai-regulatory-developments-for-companies-to-watch-out-for.html) |

**Maps to APATRIS+EEJ gap:** EEJ already aligns (3-tier + approval gate in `services/communication.ts`). APATRIS lacks consolidated 3-tier; AI drafters scatter across call sites with no central approval queue.

**Recommended approach:** Refine EEJ's 3-tier pattern inbound to APATRIS + add audit log UI surface (the 'structurally visible' part Fuselab flags).

---

### TARGET 3 — Polish/EU regulatory specifics for worker-facing comms

| Finding | Cited source |
|---|---|
| **GDPR Article 22(1):** "The data subject shall have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects concerning him or her or similarly significantly affects him or her." | [GDPR Article 22 verbatim text](https://gdpr-info.eu/art-22-gdpr/) |
| **GDPR Article 22(3):** Controllers must implement "suitable measures to safeguard the data subject's rights... at least the right to obtain human intervention on the part of the controller, to express his or her point of view and to contest the decision." | Same source |
| **SCHUFA judgment removed the formal-sign-off escape.** "Meaningful human review is required, not formal sign-off." Pre-approval of AI message templates is not sufficient cover. | [Legiscope: GDPR Article 22 Automated Decision-Making](https://www.legiscope.com/blog/gdpr-article-22-automated-decision-making.html), [Bloomberg Law: GDPR Curbs Use of AI Via Article 22](https://www.bloomberglaw.com/external/document/X4BBTPFO000000/international-data-privacy-compliance-professional-perspective-g) |
| **EU AI Act Article 26(7):** Deployers of high-risk AI systems must "inform workers' representatives and affected workers" before deployment. Applies to staffing agencies + their workers. | [EU AI Act: What it means for staffing businesses](https://artificialintelligenceact.eu/what-the-act-means-for-staffing-businesses/) |
| **EU AI Act Annex III high-risk categories include:** AI in hiring, performance evaluation, promotion, termination, task allocation, monitoring of worker behavior. Profiling-based systems are **always high-risk** per Article 6(3) regardless of derogation. | [EU AI Act Annex III](https://artificialintelligenceact.eu/annex/3/), [EU AI Act Article 6 deep-fetch](https://artificialintelligenceact.eu/article/6/) |
| **EU AI Act enforcement cutoff for employment-related AI:** 2 August 2026 — full high-risk system obligations become enforceable. Fines up to €15M or 3% of global turnover. | [CDT: EU AI Act Brief — AI at Work](https://cdt.org/insights/eu-ai-act-brief-pt-4-ai-at-work/), Same staffing source above |
| **EU AI Act Article 86:** Workers can request explanations of "main factors behind those decisions" made by high-risk AI systems affecting them. | Same staffing source above |
| **Posted Workers Directive 2018/957/EU:** Employer posting to Poland must submit prior declaration to Polish State Labour Inspection (PIP). Must inform worker **in writing** about: country of work, expected duration, currency of payment, monetary/in-kind benefits, conditions of return. | [Biznes.gov.pl: Posting of workers to Poland](https://www.biznes.gov.pl/en/portal/001806), [ATL-Law: Posting Workers to Poland 2026](https://atl-law.pl/en/posting-workers-to-poland-employer-obligations-in-2026/), [EUR-Lex Directive 2018/957](https://eur-lex.europa.eu/eli/dir/2018/957/oj/eng) |
| **Kodeks pracy (Polish Labor Code) — January 27, 2026 amendments:** Permits *postać elektroniczna* (electronic form, no qualified e-signature) for ~15 personnel actions — leave requests, individual schedules, time-off-for-overtime, monitoring notifications, BHP confirmations. Must guarantee: integrity (no undetectable modification), identifiability (who/when/what submitted), GDPR/RODO compliance. | [Infor.pl: Kodeks pracy 2026 amendments](https://kadry.infor.pl/urlopy/wypoczynkowy/7459496,zmiany-w-kodeksie-pracy-2026-r-dotyczace-ekwiwalentu-urlopowego-oraz-form-wnioskow-i-dokumentow-kadrowych.html), [Calamari: Elektroniczne wnioski pracownicze 2026](https://www.calamari.pl/blog/elektroniczne-wnioski-pracownicze-po-nowelizacji-kodeksu-pracy-2026-przepisy-wymogi-i-praktyczny-przewodnik-wdrozenia), [RCPonline: Kodeks Pracy 2026 e-dokumenty](https://rcponline.pl/blog/kodeks-pracy-2026-e-dokumenty-i-wyplata-ekwiwalentu/) |

**Maps to APATRIS+EEJ gap:** Neither codebase has explicit GDPR Art 22 human-intervention surface for AI messages. Neither has EU AI Act Article 26(7) worker pre-deployment notification flow. APATRIS has electronic-form leave-request capability but not the integrity/identifiability/audit signature surface the Kodeks pracy 2026 amendments require.

**Recommended approach:** Treat regulatory items as **must-haves** for any AI-message capability. See "Regulatory checklist" below.

---

### TARGET 4 — Silence-watcher / no-response-fallback patterns

| Finding | Cited source |
|---|---|
| **The canonical pattern is from incident-management, not customer service.** PagerDuty + Opsgenie have mature unacknowledged-notification-timeout cascade primitives. | [PagerDuty: Escalation Policy Basics](https://support.pagerduty.com/main/docs/escalation-policies) |
| **PagerDuty default escalation timeout: 30 minutes** before escalating to next rule. Adjustable per policy. Repeat-N-times applies only while incident remains unacknowledged. | [PagerDuty: Expected Notification Behavior](https://support.pagerduty.com/main/docs/expected-notification-behavior) |
| **Acknowledged-but-not-resolved → re-trigger pattern:** Acknowledgement timeout returns incident to triggered state; re-notifies original responder + current on-call if rotation changed. | Same PagerDuty source |
| **AI takeover pattern (customer service):** Not "AI does nothing if human silent" — instead, AI uses **mandatory fallback threshold** (N retry attempts at clarification) before automatic handoff to human, passing full transcript. Reverse of what AC-55 needs (AC-55 wants AI to step in **for** humans, not vice versa). | [Kommunicate: AI customer service escalation](https://www.kommunicate.io/blog/ai-customer-service-escalation/), [Replicant: When to hand off to a human](https://www.replicant.com/blog/when-to-hand-off-to-a-human-how-to-set-effective-ai-escalation-rules) |
| **SLA-driven signals are standard:** Time-to-human (ETT) measured escalation-trigger → agent-pickup → first-meaningful-response. Conversation context (sentiment, history, attempted solutions) must transfer on handoff. | [SearchUnify: AI-Powered Escalation Management](https://www.searchunify.com/resource-center/sudo-technical-blogs/ai-escalation-management-mastering-handoffs-in-modern-support/), Bucher+Suter source below |
| **AC-55-specific gap:** No industry-standard "AI takes over when human stays silent" pattern surfaced. Closest model is PagerDuty-style escalation cascade — re-notify, then escalate up the chain. AI fallback for silent humans appears to be a **net-new design space** (Phase 1+2 also blank). | [Bucher+Suter: Escalation Design](https://www.bucher-suter.com/escalation-design-why-ai-fails-at-the-handoff-not-the-automation/) |

**Maps to APATRIS+EEJ gap:** Neither codebase has this. Industry has the cascade-timeout primitive (from incident-mgmt) but not the AI-takeover-when-human-silent primitive.

**Recommended approach:** Adopt PagerDuty-style cascade timeout primitive for human notification escalation. Treat "AI fills in when human silent for N hours" as **novel pattern** to design from scratch — no off-the-shelf model exists. Manish-decision required on whether to ship at all (legal risk of AI speaking on behalf of silent human).

---

### TARGET 5 — AI auto-flag / toxicity / pattern detection in workforce messaging

| Finding | Cited source |
|---|---|
| **Enterprise scale validates the pattern.** Microsoft Teams processes 30B+ chat messages/month; Slack handles 15B+ messages/quarter. Both moderate via AI at scale. | [Conectys: AI Content Moderation Trends 2026](https://www.conectys.com/blog/posts/ai-content-moderation-trends-for-2026/) |
| **By 2026, AI moderation is a core feature of every major enterprise community platform.** Market projected >$5B globally. 67% of enterprise platforms are accelerating implementations. | [Bevy: AI Moderation Tools for Enterprise Communities](https://bevy.com/b/blog/ai-moderation-tools-for-enterprise-communities-in-2025) |
| **Hybrid AI-human is the dominant architecture.** AI does heavy lifting (real-time scan + risk score + flag for review); humans handle edge cases. Pure-AI moderation is operationally unviable at scale. | [GetStream: Content Moderation Trends](https://getstream.io/blog/content-moderation-trends/) |
| **LLM-powered classifiers detect:** subtle harassment vs jokes, grooming attempts, implied threats in neutral-sounding text. Pattern detection looks for: sharp toxicity spikes, conversation drift toward risk, high-velocity message bursts, suspicious behavior signals. | [Mixpeek: Best AI Content Moderation Tools 2026](https://mixpeek.com/curated-lists/best-ai-content-moderation-tools), Conectys source above |
| **Reported ROI:** 60-80% cost reductions, 40-65% efficiency improvements, 25-45% reduction in moderation errors. | Bevy source above |
| **Top guardrail platforms 2026:** Spectrum Labs, Cometchat, Foiwe, Getmaxim — typically API-as-a-service, not in-house build. | [Spectrum Labs](https://www.spectrumlabsai.com/ai-for-content-moderation/), [Cometchat: Automated Content Moderation Tools](https://www.cometchat.com/blog/automated-content-moderation-tools), [Getmaxim: Top 5 AI Guardrails Platforms](https://www.getmaxim.ai/articles/top-5-ai-guardrails-platforms-for-responsible-enterprise-ai-in-2026/) |

**Maps to APATRIS+EEJ gap:** Neither codebase has any moderation. APATRIS has Claude Sonnet 4.6 already in stack — could call Claude with a moderation prompt rather than adopting a third-party API.

**Recommended approach:** Light first pass — call Claude with structured "classify this worker message for harassment/escalation/concern" prompt; route flagged messages to T1/T2 review queue. Defer third-party guardrail API integration until volume justifies.

---

### TARGET 6 — Multi-channel routing cascade

| Finding | Cited source |
|---|---|
| **Twilio Notify is DEPRECATED (October 2022).** No longer the canonical Twilio approach. Modern guidance: Programmable Messaging + APNs/FCM directly, with fallback logic at application layer. | [Twilio Notify docs (deprecation notice)](https://www.twilio.com/docs/notify), [Courier: What is the Twilio Messaging API](https://www.courier.com/blog/what-is-the-twilio-messaging-api) |
| **Modern Twilio cascade pattern:** Specify primary channel + one or more fallback channels. If primary fails, auto-attempt fallback. Recipient address required for every channel involved (except RCS/SMS pair). | [Twilio: Channel Fallback](https://www.twilio.com/docs/bulk-messaging/channel-fallback) |
| **Verify product fallback pattern:** Same primary→fallback chain with channel-specific failure semantics. | [Twilio: Verify Channel Selection](https://www.twilio.com/docs/verify/fallback-scenarios) |
| **Preference Center pattern (industry standard):** Per-user × per-message-type × per-channel grid. User controls quiet hours, digest mode, priority levels per notification type. | [OneSignal: User Preference Centers](https://onesignal.com/blog/a-guide-to-user-preference-centers/), [Knock: Preferences Overview](https://docs.knock.app/preferences/overview), [Courier: How to Build a Notification Center](https://www.courier.com/blog/how-to-build-a-notification-center-for-web-and-mobile-apps) |
| **Notification routing best practice:** "Critical alerts via SMS and newsletters via email" — channel preference is per-category, not blanket. Workforce platforms like Shyft expose granular per-channel/per-message-type controls. | [Medium: Designing a Scalable Notification System](https://medium.com/@anshulkahar2211/designing-a-scalable-notification-system-email-sms-push-from-hld-to-lld-reliability-to-d5b883d936d8), [MagicBell: Notification System Design](https://www.magicbell.com/blog/notification-system-design), [Shyft: Mastering Notification Preferences](https://www.myshyft.com/blog/notification-preferences/) |
| **Orchestration layer products (Courier, Knock, MagicBell, SuprSend, OneSignal):** Position themselves as the routing/cascade/preference layer above Twilio + SendGrid + APNs. Suggests building this in-house is a known pain point worth abstracting. | [SuprSend](https://www.suprsend.com/), [Courier vs Twilio](https://www.courier.com/guides/courier-vs-twilio) |

**Maps to APATRIS+EEJ gap:** EEJ has typed `NotificationChannel` enum but no documented cascade-failure handling. APATRIS has no channel router at all (per-callsite routing). Neither has a preference center.

**Recommended approach:** Adopt EEJ-style typed channel enum (refine inbound) + add cascade fallback (industry standard) + ship minimal preference center as Phase B Wave 2. Critical-vs-marketing channel split is the first-cut UX.

---

## Headline synthesis

### Top 3 patterns where industry has clear answer Phase 1+2 didn't show

1. **Hybrid Push + WebSocket is the industry standard for mobile workforce comms** (not either/or). Push for re-engagement/closed-app; WebSocket for in-session. APATRIS push stack + EEJ WebSocket spine combined = textbook architecture.

2. **3-tier AI message classification with audit-trail UX-surface** is established pattern in regulated industries (Fuselab, Domino, Trussed sources). EEJ's `services/communication.ts` already aligns; what's missing on both sides is the *interface-visible* audit surface (per Fuselab: "cannot live only in a database").

3. **Per-user × per-channel × per-message-type preference center** is canonical (OneSignal, Knock, Courier, MagicBell all converge on this). Neither APATRIS nor EEJ has this. Industry has 5+ off-the-shelf orchestration layers (Courier, SuprSend, MagicBell, Knock, OneSignal) — suggests building from scratch is non-trivial.

### Critical regulatory must-haves

| Rule | Article | Requirement | APATRIS impact |
|---|---|---|---|
| GDPR | Art 22(1) | No solely-automated decisions with legal/significant effect on worker | AI messages affecting hiring/termination/discipline cannot be sent without meaningful human review |
| GDPR | Art 22(3) | Human intervention surface; worker can contest decision | UI must expose "request human review" + "contest" flows |
| EU AI Act | Art 6 + Annex III | AI in hiring/performance/promotion/termination/task-allocation/worker-monitoring = high-risk | Most APATRIS AI use cases are high-risk; profiling-based ones are **always** high-risk regardless of derogation |
| EU AI Act | Art 26(7) | Deployer must inform worker representatives + affected workers **before** deployment | Workers must be notified that AI is generating their messages before first AI-sent message |
| EU AI Act | Art 86 | Workers can request explanation of decision logic | Must surface "why was this message generated" reasoning per-message |
| EU AI Act | Enforcement | 2 August 2026 — full high-risk obligations enforceable; fines up to €15M or 3% global turnover | **<3 months until enforcement** as of audit date |
| Posted Workers Directive | 2018/957/EU | Posted-worker notification to PIP (Polish Labour Inspectorate) + written info to worker (country, duration, currency, benefits, return conditions) | Comms layer must handle PIP notification + worker written notification (both already partial in APATRIS) |
| Kodeks pracy | 2026 amendments (Jan 27) | *Postać elektroniczna* permitted for leave requests + ~15 personnel actions; requires integrity + identifiability + GDPR/RODO compliance | APATRIS leave-request flow is on this surface; must guarantee audit trail of sender identity + content immutability |

### Surprising findings vs Phase 1+2 predictions

1. **Twilio Notify deprecation (2022).** Phase 2 didn't flag this; EEJ uses Twilio WhatsApp directly (correct) but if APATRIS engineering ever Googles "Twilio multi-channel notify" the deprecated product is the first hit. Worth a CLAUDE.md or comms-build-plan footnote.

2. **Kodeks pracy January 2026 amendments are directly relevant.** Phase 1+2 framed leave-requests as a generic feature; the 2026 amendments make *postać elektroniczna* explicitly legal for leave-requests + 14 other actions — but require integrity + identifiability + RODO compliance. APATRIS leave-request flow (AC-39 Wave 1 just shipped Day 30) is now operating in a regulated zone with explicit compliance hooks.

3. **EU AI Act Article 26(7) pre-deployment worker notification.** Neither Phase 1 nor Phase 2 surfaced this. It's a *process* requirement (notify workers before turning AI on), not a code requirement — but the comms system needs a "first contact" notification template, and the timing matters for the August 2026 enforcement cutoff.

4. **"AI takes over when human is silent" pattern doesn't exist in industry.** Closest is PagerDuty cascade (human-to-human), or customer-service handoff (AI-to-human, not human-to-AI). Phase 2 noted both APATRIS + EEJ blank here; Phase 3 confirms **no established industry pattern**. This is genuine net-new design space — must be approached cautiously given GDPR Article 22 risk profile.

5. **In-house AI moderation is viable given APATRIS already has Claude in stack.** Industry trend says use Spectrum Labs / Cometchat / Foiwe APIs. APATRIS can call Claude with a structured moderation prompt for v1 → defer third-party integration. Cost/benefit favors in-house for our scale.

### Where APATRIS+EEJ approach already aligns with industry best practice

- **EEJ's 3-type message classification with approval gate** (Phase 2 finding) matches Fuselab/Domino regulated-industry pattern. Validation, not change.
- **APATRIS's per-worker push subscription model + VAPID** matches industry standard for mobile push. Validation, not change.
- **EEJ's WebSocket broadcast spine** for real-time fan-out matches hybrid push+WebSocket architecture industry recommends. Validation + refine inbound to APATRIS.
- **APATRIS in-app `messages` + `message_threads` tables** (Phase 1) align with industry direction; EEJ relies on WhatsApp only which leaves gap on audit trail. Validates outbound APATRIS→EEJ flow direction.

---

## Regulatory checklist (must-have for AC-55 Phase B)

- [ ] GDPR Art 22 — meaningful human intervention surface for AI-generated messages affecting worker (not template pre-approval; per-message review)
- [ ] GDPR Art 22 — contest-the-decision flow visible from worker UI
- [ ] EU AI Act Art 26(7) — pre-deployment worker notification template + delivery + acknowledgement record (deadline: 2 August 2026)
- [ ] EU AI Act Art 86 — per-message "why was this generated" reasoning surface
- [ ] EU AI Act risk classification — internal audit of which APATRIS AI use cases trigger Annex III high-risk (hiring/performance/promotion/termination/task-allocation/monitoring)
- [ ] EU AI Act Art 12 — log retention for AI system events, minimum 6 months
- [ ] Posted Workers Directive — PIP notification automation hook + worker written-info template
- [ ] Kodeks pracy 2026 (Jan 27 amendments) — leave-request flow needs verified-sender + content-immutability audit trail
- [ ] RODO baseline — all comms encrypted at rest (EEJ has `lib/encryption.ts` with proper crypto; APATRIS XOR placeholder is non-compliant)

---

## Anti-hallucination caveats

- **Beekeeper + Workvivo specific architectures:** Search returned high-level features (push notifications, mobile-first, offline access) but no public technical disclosure of WebSocket-vs-Push internals. Architectural recommendations are inferred from **industry-best-practice sources** (Curiosum, dev.to, IEEE), not from Beekeeper/Workvivo proprietary documentation. Confidence: medium-high on the pattern, low on attribution-to-specific-vendor.
- **EU AI Act Article 86 interpretation:** I cited the staffing-businesses summary page; full Article 86 text was not deep-fetched. If precise wording needed for engagement letter or legal opinion, escalate to Yulia (Polish radca prawny) for verification.
- **2 August 2026 enforcement cutoff:** Cited from two sources (CDT + staffing-businesses summary). The Regulation 2024/1689 itself (EUR-Lex) is the authoritative source; the cutoff date should be cross-checked at the regulation level before being load-bearing in Phase B Wave commitments.
- **Kodeks pracy January 27, 2026 amendments:** Polish-language sources (Infor.pl, Calamari, RCPonline). I translated the relevant compliance hooks but did not deep-fetch the actual amendment text (Dz.U.). Yulia should verify before APATRIS surfaces claim Kodeks-pracy-2026 compliance.
- **"AI takes over when human is silent" gap:** I confirmed no established industry pattern via 2 search queries; absence-of-evidence ≠ evidence-of-absence. May exist as proprietary internal pattern at one of the workforce platforms but not publicly documented.
- **Twilio Notify deprecation date (October 2022):** Cited Twilio's own deprecation notice — high confidence.
- **All Polish-language sources** are commercial blogs (Infor.pl, Calamari, RCPonline) summarizing Kodeks pracy amendments, not primary legal text. Treat as orientation, not as legal citation.

---

## Synthesis input — what 3-phase deep research means for AC-55 architecture

(Read this section as **input to chat-Claude's synthesis step**, not as the synthesis itself.)

### Architecture posture validated by Phase 3

- **Hybrid Push + WebSocket** is the right base architecture. APATRIS already has push; EEJ already has WebSocket. Combine them.
- **3-tier AI message + approval gate** is the right pattern for AI-generated comms. EEJ already has it. APATRIS should refine inbound.
- **Typed multi-channel router with cascade fallback** is industry standard. EEJ has the typed enum; cascade + preference center is buildable from there.

### Architecture decisions Phase 3 puts on the table

- **Build vs buy on AI moderation:** in-house Claude prompt (cheap, ships fast, APATRIS-controlled) vs third-party guardrail API (more accurate, more expensive, vendor dependency). Recommend in-house v1.
- **Build vs buy on notification orchestration:** in-house typed router (EEJ-pattern) vs adopt Courier/Knock/SuprSend SDK. Recommend in-house v1 — these orchestrators add real value above 10K users; APATRIS at 200+ workers doesn't justify the dependency yet.
- **Silence-watcher / AI fallback for silent humans:** **no industry pattern exists**. This is novel design with GDPR Art 22 risk. Recommend deferring or scoping very narrowly (e.g., "AI sends a reminder after 24h silence" — not "AI speaks on behalf of human").

### Hard regulatory deadline

- **2 August 2026** — EU AI Act high-risk obligations enforce for employment AI. APATRIS uses AI extensively in worker-facing flows. Any AI-message capability shipped after this date without GDPR Art 22 + AI Act Art 26(7) compliance is a fine risk (up to €15M or 3% global turnover).

### AC-55 reframing inputs (for chat-Claude synthesis step)

Phase 1 captured AC-55 as 5-capability umbrella. Phase 3 evidence suggests these 5 should be reorganized around:
- Capability A: **Transport spine** (Push + WebSocket hybrid + typed channel router + cascade)
- Capability B: **AI message generation with 3-tier + approval gate** (refine EEJ pattern inbound + add audit-UI surface)
- Capability C: **Worker preference center** (channel × message-type × quiet hours × digest)
- Capability D: **Regulatory compliance scaffolding** (GDPR Art 22 surface + AI Act Art 26(7) pre-deployment notification + Art 86 reasoning surface + Kodeks pracy 2026 audit trail)
- Capability E: **AI moderation + safety** (Claude-prompt v1 in-house, third-party deferred)

Silence-watcher / AI-fallback-when-human-silent — **drop from AC-55 scope**, capture as separate AC (or kill candidate) given novel-design + GDPR Art 22 risk.

This is **input for synthesis**, not synthesis. chat-Claude does the synthesis next.

---

## Status

- **Phase 3 complete** — APATRIS + EEJ + industry + regulatory baselines now in hand
- **Ready for chat-Claude synthesis step** — combine Phase 1 (`3bec12e`) + Phase 2 (`9de9371`) + Phase 3 (this doc) into AC-55 architecture recommendations + AC reframing + Phase B buildable plan
- **Hard Boundaries respected:** Phase 3 research-and-cite only; no synthesis or AC reframing performed in this commit
