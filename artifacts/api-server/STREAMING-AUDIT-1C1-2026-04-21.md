# Streaming Audit 1C-1 — Claude → SSE Migration (2026-04-21)

Read-only audit. Goal: map every synchronous Claude call in the codebase, group by streaming suitability, and propose the minimal path from 0 → working token-level streaming for the user-facing legal workflows.

**Headline:** 33 Claude call sites across 18 files. ~9 are user-facing and free-text (prime streaming candidates). The SSE infrastructure is already in place but designed for discrete notifications, not token flow — an AI streaming event type needs a per-request channel to avoid broadcasting tokens to every connected client. The rate limiter is call-counted and stays unchanged. Cancellation is not wired anywhere; streaming migration is a natural time to add it.

---

## 1. All Claude Call Sites

33 `anthropic.messages.create()` call sites across 18 files. Full table:

| File:line | Service / route | Purpose | `max_tokens` | Output | Post-call handling |
|---|---|---|---|---|---|
| `services/intelligence-router.service.ts:130` | intelligence-router | Polish law Q&A routing — Tier 3 Claude synthesis | 1024 | **free text** | direct string (`.content[0].text`) |
| `services/case-doc-generator.service.ts:226` | case-doc-generator | Polish TRC/legal doc (PL) | 2048 | **free text** | direct string |
| `services/case-doc-generator.service.ts:235` | case-doc-generator | English doc (EN) | 2048 | **free text** | direct string |
| `services/ai-provider.ts:53` | ai-provider (generic) | wrapper | 1024 | free text | direct string |
| `services/ai/provider.ts:25` | ai/provider (alt) | wrapper | 512 | free text | direct string |
| `routes/frameworks.ts:84` | frameworks | SLA/guarantee terms | 1024 | **JSON** | `JSON.parse` |
| `routes/legal.ts:46` | daily-legal-scan | compliance risk scan (loop) | 1024 | free text | direct string |
| `routes/intelligence-feed.ts:46` | intelligence-feed | market synthesis | 512 | free text | direct string |
| `routes/analytics.ts:245` | analytics | biz analytics synthesis | 500 | free text | direct string |
| `lib/complianceAI.ts:70` | compliance (welding) | welding compliance | 1024 | **JSON** | `JSON.parse` |
| `routes/signals.ts:39` | signals (market) | signal detection (loop) | 512 | **JSON** | `JSON.parse` |
| `routes/safety.ts:98` | safety | site safety incident | 1024 | **JSON** | `JSON.parse` |
| `routes/competitors.ts:51` | competitors | market rate analysis | 512 | **JSON** | `JSON.parse` |
| `routes/workers.ts:45` | workers (OCR) | passport extraction | 512 | **JSON** | `.match(/\{[\s\S]*\}/)` |
| `routes/workers.ts:77` | workers (OCR) | doc-type field extraction | 256 | **JSON** | regex + `JSON.parse` |
| `routes/workers.ts:401` | workers (OCR) | general field extraction | 300 | **JSON** | regex + `JSON.parse` |
| `routes/translate.ts:85` | translate | multilingual translation | 1024 | **free text** | direct string |
| `routes/legal-kb.ts:70` | legal-kb | KB Q&A | 1024 | **free text** | direct string |
| `routes/legal-kb.ts:84` | legal-kb | KB fallback Q&A | 1024 | **free text** | direct string |
| `routes/immigration.ts:167` | immigration | TRC/work-permit risk | 1024 | **JSON** | `JSON.parse` |
| `routes/trc-service.ts:227` | trc-service | TRC checklist | 2048 | **JSON** | `JSON.parse` |
| `routes/public-verify.ts:185` | public-verify | passport verification | 512 | **JSON** | regex + `JSON.parse` |
| `routes/ai-copilot.ts:98` | ai-copilot | agent synthesis | 1024 | free text | direct string |
| `routes/worker-email.ts:144` | worker-email | email content parse | 512 | **JSON** | `JSON.parse` |
| … (legal-brief-pipeline stages, legal-intelligence, authority-response, rejection-intelligence, regulatory, etc.) | — | (per-stage and per-function calls) | 1024–2048 | mixed | mixed |

**Split:**
- **Free-text outputs:** 11 call sites (document generation, Q&A, synthesis, translation, legal-kb, copilot)
- **JSON-structured:** 12+ call sites (analysis, extraction, risk, classification)
- **Mixed (JSON wrapper around free-text fields):** ~5 (legal-intelligence appeal drafts, authority-response pack text, parts of legal-brief-pipeline stages)

---

## 2. Prioritized Migration List

| Priority | Service | Calls | Rationale |
|---|---|---|---|
| **HIGH** | `case-doc-generator` | 2 (PL + EN) | Lawyer waits for bilingual legal doc. ~2K tokens each = 4K per case. Best single-flip ROI. |
| **HIGH** | `legal-copilot` | 1 per Q&A | Chat UX — streaming is the whole point of a copilot. |
| **HIGH** | `legal-brief-pipeline` | 4+ (stages 1,2,3,5,6) | 6-stage pipeline. Stage-level events add "Stage 2/6 ✓" progress UX even before per-token streaming. |
| **HIGH** | `legal-intelligence` (appeal drafting, POA, authority letter, legal reasoning) | 4+ | Bilingual legal drafts. Long-running. Mixed output (stream text fields, parse wrapper separately). |
| **HIGH** | `trc-service` (checklist) | 1 | User-facing but **JSON**. Not a streaming candidate. Skip this one. |
| **HIGH** | `intelligence-router` Tier 3 | 1 | Q&A UX. Streaming visible. |
| **MEDIUM** | `authority-response` | 1 | DRAFT-only, sits in queue. Nice-to-have. Mixed output like legal-intelligence. |
| **MEDIUM** | `legal-kb` | 2 | Q&A. Streaming fine. Lower-volume flow than copilot. |
| **MEDIUM** | `ai-copilot` (agent synthesis) | 1 | Free text. Minor UX benefit. |
| **MEDIUM** | `rejection-intelligence` | 1 | **JSON**. Not streamable; keep sync. |
| **MEDIUM** | `immigration` (risk prediction) | 1 | **JSON**. Keep sync. |
| **LOW** | `workers` (OCR × 3) | 3 | JSON. Short calls. Keep sync. |
| **LOW** | `public-verify` | 1 | JSON. External. Keep sync. |
| **LOW** | `frameworks`, `signals`, `safety`, `competitors`, `compliance (welding)`, `worker-email` | 6 | JSON. Background or batch. Keep sync. |
| **LOW** | `daily-legal-scan`, `intelligence-feed`, `analytics` | 3 | Free text but batch/scheduled, not user-facing. Keep sync. |
| **LOW** | `translate` | 1 | Free text, one-shot. Could stream; minimal UX benefit. Defer. |

**Net prime candidates for streaming:** case-doc-generator (PL + EN), legal-copilot, legal-brief-pipeline (stage-level first, then per-token on stages 1/2/5/6), legal-intelligence (appeal drafts + authority letter + legal reasoning), intelligence-router Tier 3. That's ~13 call sites across 5 services, which cover the lawyer's actual real-time waiting moments.

---

## 3. SSE Producer Pattern — Today

### `lib/intelligence-emitter.ts` (full shape)
```ts
import { EventEmitter } from "events";

export interface IntelligenceEvent {
  type: "status_change" | "doc_verified" | "mos_ready";
  workerId: string;
  workerName: string;
  message: string;
  timestamp: string;
  meta?: Record<string, any>;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emitIntelligenceEvent(event: IntelligenceEvent): void { emitter.emit("intelligence", event); }
export function onIntelligenceEvent(h: (e: IntelligenceEvent) => void): () => void {
  emitter.on("intelligence", h); return () => emitter.off("intelligence", h);
}
```

**Characteristics:**
- **Discrete notifications**, not continuous token flow
- **Global pub/sub** (one EventEmitter instance for the whole process)
- **No per-request scoping** — all connected SSE clients receive all events
- **No tenant filtering** at the emitter layer (filtering is possible in the consumer)
- **Sync emit, sync bus** — no backpressure, no persistence

### Current producers (3)
| File | Line | Event type | Scope |
|---|---|---|---|
| `services/legal-status.service.ts` | 525 | `status_change` | global |
| `routes/mos.ts` | 92 | `mos_ready` | global |
| `routes/document-intelligence.ts` | 261 | `doc_verified` | global |

### Fits AI streaming?
Not without modification. Streaming a Claude response emits ~50–200 chunk events per call; broadcasting them globally would spam every connected SSE client. Three options:

1. **Add a new event type** `ai_stream_chunk` with `{ streamId, chunk, seq, done }` + client-side filtering by `streamId`. Simplest; works with existing infra. Downside: still broadcasts bytes to all clients (cheap but noisy).
2. **Per-request SSE endpoint.** A new route `POST /api/v1/legal/{service}/stream` that opens an HTTP SSE connection tied to the specific request. No shared bus, no cross-client leak. Requires new routes but no emitter change. **Recommended.**
3. **WebSocket with rooms.** Overkill for current scale; adds dependency; reconsider later if we need bidirectional (cancel mid-stream) more than HTTP AbortSignal gives us.

---

## 4. SSE Consumer Pattern + Frontend Readiness

### Server endpoint — `routes/intelligence-stream.ts`
```ts
router.get("/intelligence/stream", (req, res) => {
  // JWT via ?token= (EventSource can't send headers)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  // disables nginx buffering
  });
  res.write(`data: ${JSON.stringify({ type: "connected", ... })}\n\n`);
  const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 30_000);
  const unsubscribe = onIntelligenceEvent((event) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* disconnected */ }
  });
  req.on("close", () => { clearInterval(keepAlive); unsubscribe(); });
});
```

### Client consumer — `pages/LegalCommandCenter.tsx:56-86`
```ts
function useSSEStream(): TickerEvent[] {
  const [events, setEvents] = useState<TickerEvent[]>([]);
  useEffect(() => {
    let source: EventSource | null = null;
    function connect() {
      const token = localStorage.getItem("apatris_jwt");
      source = new EventSource(`${BASE}api/intelligence/stream?token=${token}`);
      source.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "connected") return;
          setEvents(prev => [data, ...prev].slice(0, 50));
        } catch {}
      };
      source.onerror = () => { source?.close(); setTimeout(connect, 5000); };
    }
    connect();
    return () => source?.close();
  }, []);
  return events;
}
```

**Findings:**
- Token in query param (EventSource limitation). JWT verified on connect; **no refresh during stream lifetime** — long-running streams will orphan when JWT expires. Acceptable for 15-min JWTs + 10s streams; problem for 15-min JWT + 3-min stream.
- 5s auto-reconnect. Good.
- **One EventSource per page**; whole app shares it. Currently only `LegalCommandCenter` subscribes.
- Client expects complete JSON payload per event; no concept of partial payload.

### Frontend streaming readiness

Grep for `react-markdown`, `ReactMarkdown`, `useCompletion`, `useChat`, `streaming`, `onChunk`, `useStream`, `ai/react` → **zero matches**.

**Implication:** no progressive-text component exists today. Will need a new one (~50–80 lines) for both rendering and accumulating tokens.

---

## 5. Cancellation + Rate-Limit Compatibility

### AbortController today
Found only for timeouts:
- `services/system-hardening.service.ts:59-61` — `AbortController` for fetch timeout
- `services/regulatory-intelligence.service.ts:161, 194` — `AbortSignal.timeout(15000)`
- `services/regulatory-ingestion.service.ts:150, 182` — same pattern

**No Anthropic SDK call uses AbortSignal today.** The Anthropic SDK v0.20+ supports `signal: AbortSignal` in `messages.create()` — we just don't pass it. The user cannot cancel a long-running generation.

### Rate limiter — `lib/ai-rate-limiter.ts`
```ts
const LIMITS = {
  claude: { maxPerHour: 50 },
  perplexity: { maxPerHour: 10 },
};
// checkAIRateLimit(tenantId, provider) → bucket.count++; allowed / remaining / resetsIn
```

**Per-call counting, not per-token.** A streaming call is still 1 call — the rate limiter is unchanged by the sync → stream migration. The 50/hour ceiling for Claude is what matters; streaming doesn't consume more budget.

**Bucket is in-memory** → resets on deploy. Acceptable today; will need persistence before multi-machine.

---

## 6. Proposed Implementation Approach

### Two-phase rollout

**Phase 1 — Stage-level SSE for the Legal Brief Pipeline (week 1)**
- No per-token streaming yet
- Each of the 6 stages emits `brief_stage` events on start + complete (with status + confidence)
- UI shows progress: `Stage 1/6: Research ✓ · Stage 2/6: Case Review (in progress) · Stage 3/6: pending · …`
- Lawyer sees progress, knows the system is alive, can estimate remaining time
- **Zero risk of partial-JSON corruption** because outputs are still fully formed per stage
- Reuses existing emitter + SSE endpoint with one new event type

**Phase 2 — Per-token streaming for free-text services (weeks 2–3)**
- Dedicated per-request SSE endpoints per streaming service
- `case-doc-generator` → `POST /api/v1/vault/docs/generate-stream` (SSE response)
- `legal-copilot` → `POST /api/v1/legal/copilot/ask-stream` (SSE response)
- `legal-brief-pipeline` stages 1/2/5/6 stream inside their stage events
- Frontend gets a `<StreamingMarkdown />` component
- AbortController wired end-to-end (client disconnect → backend `AbortSignal` → Anthropic SDK)

### Why stage-level before per-token

Stage-level events give 80% of the UX win for 20% of the engineering:
- No new frontend component needed (just append to the existing ticker)
- No partial-JSON parsing risk
- No AbortController work (each stage is still atomic)
- Buys real-time feedback for the single most user-visible workflow (Legal Brief Pipeline)

Per-token streaming is bigger lift (new frontend component + per-request channels + cancellation + partial-content rendering) and is worth doing, but doesn't have to ship on day 1.

### Which services get which treatment

| Service | Phase 1 (stage-level) | Phase 2 (per-token) | Stays sync |
|---|---|---|---|
| `legal-brief-pipeline` (6 stages) | ✅ (Phase 1 stage events) | ✅ (text-heavy stages 1/2/5/6 per-token) | JSON validation in stage 3 stays sync |
| `case-doc-generator` (PL + EN) | — | ✅ | — |
| `legal-copilot` | — | ✅ | — |
| `legal-intelligence` (appeal drafts, authority letter, reasoning) | — | ✅ (stream text fields; parse wrapper separately) | POA (templated, non-AI) |
| `intelligence-router` Tier 3 | — | ✅ | Tier 1 (KB) stays sync; Tier 2 (Perplexity) — defer |
| `authority-response` pack | — | Later | — |
| `legal-kb` Q&A | — | Later | — |
| JSON services (OCR, risk, checklists, signals, safety, etc.) | — | — | ✅ (stay sync; JSON unsuitable for token streaming) |

### Partial-JSON and mixed outputs

For services with a JSON wrapper around a free-text field (e.g., `legal-intelligence`'s appeal draft: `{appealGrounds[], missingEvidence[], appealDraftPl: "…long text…", …}`), the pattern is:
1. On the backend: use Anthropic's `stream: true` with tool_use `input_schema`. Claude will stream property-by-property. Accumulate non-text fields server-side; emit `chunk` events only for the text fields as they arrive.
2. On the frontend: render the text field progressively. Hold the wrapper JSON until `done` event.

This isn't worth writing custom until Phase 2. For Phase 1 (stage-level) it doesn't apply.

### Server-side shape (Phase 2, per-service endpoint pattern)

```
POST /api/v1/legal/copilot/ask-stream    Accept: text/event-stream
Body: { workerId, question }

Response: text/event-stream
  event: start
  data: { streamId, service: "legal-copilot" }

  event: token
  data: { chunk: "Based on " }

  event: token
  data: { chunk: "Art. 108 " }

  ... many token events ...

  event: done
  data: { totalTokens, confidence, warnings: [] }

  event: error   (optional)
  data: { code, message }
```

Each endpoint wires:
```ts
const stream = await anthropic.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [...],
  signal: req.signal,   // forwarded AbortSignal
});

for await (const event of stream) {
  if (event.type === "content_block_delta") {
    res.write(`event: token\ndata: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
  }
}
res.write(`event: done\ndata: ${JSON.stringify({...})}\n\n`);
res.end();
```

### Frontend hook pattern

```ts
function useStreamingEndpoint(url: string, body: any) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController>();

  const start = useCallback(async () => {
    abortRef.current = new AbortController();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: abortRef.current.signal,
    });
    // parse SSE frames from res.body reader, setText(prev => prev + chunk)
    // on "done" event → setDone(true)
  }, [url, body]);

  const cancel = () => abortRef.current?.abort();

  return { text, done, error, start, cancel };
}
```

---

## 7. Estimated LOC + Files Affected

### Phase 1 (stage-level SSE on Legal Brief Pipeline)

| Change | Files | LOC |
|---|---|---|
| Add `brief_stage` event type to `IntelligenceEvent` | `lib/intelligence-emitter.ts` | +5 |
| Emit stage start/complete in the pipeline | `services/legal-brief-pipeline.service.ts` (7 emit calls, ~2 lines each) | +15 |
| Consumer: render stage progress in the Legal Brief page | `pages/LegalBrief.tsx` (subscribe to `brief_stage` events, filter by briefId, render progress bar) | +60 |
| Optional: log stage timings in audit_logs | `services/legal-brief-pipeline.service.ts` | +10 |
| **Phase 1 total** | | **~90 LOC** |

No existing tests touched; no new tests required (can cover with integration test if desired, ~40 extra LOC).

### Phase 2 (per-token streaming for 4 user-facing services)

| Change | Files | LOC |
|---|---|---|
| `lib/anthropic-streaming.ts` — shared helper (client factory, stream loop, SSE frame writer, AbortSignal forwarding, error handling) | new | ~120 |
| Per-service endpoint + service function (× 4: copilot, case-doc-gen, intelligence-router T3, legal-intelligence appeal drafter) | 4 new route files + 4 service modifications | 4 × (~60 route + ~30 service) = ~360 |
| `components/StreamingMarkdown.tsx` (React; progressive markdown rendering with a buffer) | new | ~80 |
| `hooks/useStreamingEndpoint.ts` (SSE fetch + reader + AbortController) | new | ~60 |
| Wire up UI at the 4 consumer sites (Legal Copilot, Case Doc Generator drafts, Intelligence Router answers, Legal Brief stage-text) | 4 page/component edits | ~40 |
| Tests (integration against stubbed Anthropic stream) | new | ~120 |
| **Phase 2 total** | | **~780 LOC** |

Combined total (Phase 1 + Phase 2): **~870 LOC** net new, mostly in new files. Minimal churn on existing services.

### What doesn't change

- `lib/ai-rate-limiter.ts` — unchanged (per-call counting works for streaming)
- JSON-output services (17 call sites) — stay sync
- Existing `intelligence-stream.ts` SSE endpoint — unchanged for Phase 1; supplemented (not replaced) by per-request endpoints in Phase 2
- Existing producers (`legal-status`, `mos`, `document-intelligence`) — unchanged

---

## 8. Risks + Mitigations

| # | Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|---|
| 1 | **JWT expires mid-stream.** Long-running generation on a 15-min JWT that's 14 min old disconnects at minute 16. | Medium | Medium | Two fixes: (a) token refresh via EventSource reconnect logic already in place; (b) consider extending JWT lifetime during active stream. Deferred — not blocking. |
| 2 | **Client abort doesn't reach Anthropic SDK.** Without proper `signal` plumbing, we keep paying for tokens after user closed the tab. | High without mitigation | Medium (cost) | Plumb `req.signal` → Anthropic SDK `signal` option at every streaming call site. Test by killing fetch mid-stream and checking backend logs for abort event. |
| 3 | **Partial JSON on mixed-output services.** If `legal-intelligence` streams text chunks but wraps them in JSON, partial streams could look like malformed JSON to the client. | Medium | Medium | Use Anthropic `tool_use` / `input_schema` for structured outputs; client holds wrapper state until `done` event. Or: split the endpoint into "draft appeal text (streaming)" + "extract citations (sync call)" so streaming is pure free text. Prefer splitting. |
| 4 | **Rate limit under streaming load.** 50 Claude calls/hour × N open chat sessions = ceiling. Streaming doesn't change this, but a chat UX encourages more calls. | Low today | Medium at scale | Raise Claude cap to 150/hour per tenant; add per-user sub-limit (10/hour) to prevent one user monopolizing; cache identical `/legal-kb/ask` queries with Redis TTL. |
| 5 | **SSE event storm to non-target clients** if we use the global emitter for token chunks. | High | Medium | Phase 2 uses **per-request SSE endpoints**, not the global emitter. Phase 1 (stage events) is low-volume enough to piggyback on the global emitter with a `streamId` discriminator + client-side filtering. |
| 6 | **nginx/proxy buffering** chokes SSE. `X-Accel-Buffering: no` is already set on `intelligence-stream.ts`; Fly's proxy handles chunked encoding natively. | Low | Low | Reuse the same headers on new per-request endpoints. Verify in staging first. |
| 7 | **Anthropic API errors mid-stream** leave UI in ambiguous state. | Low–Medium | Medium | Emit `error` SSE event with code + message; frontend shows inline error + offer to retry. Partial rendered text stays; user can restart. |
| 8 | **Backend CPU cost** from N concurrent long-lived HTTP connections. | Low (Fly handles this well with V8 async) | Low | Node handles thousands of concurrent SSE connections easily. Monitor memory; add connection cap per tenant if needed. |
| 9 | **Testing streaming is harder than testing sync.** No existing pattern. | Medium | Low | Add an Anthropic SDK stub that yields a predetermined sequence of content_block_delta events. Used in integration tests for each streaming service. ~40 LOC of stub infrastructure. |
| 10 | **Observability gap** — if a stream silently hangs, current logging won't catch it. | Medium | Medium | Log `streamId`, stage name, byte count, duration on each stream. Add a metrics counter `ai_stream_{service}_{success|error|abort}` for Sentry or console. |

---

## Summary

- **Scope:** 33 Claude call sites; 13 are prime candidates for streaming (5 services). JSON-output calls stay sync.
- **Infra:** SSE producer/consumer pattern already exists and works. Global emitter is fine for Phase 1 stage events; per-request endpoints are the Phase 2 pattern for token flow.
- **Rate limit:** no change needed. Cancellation needs to be added — natural fit with streaming.
- **Phase 1 (week 1):** stage-level SSE on Legal Brief Pipeline. ~90 LOC. Zero risk of partial-content corruption. Gives lawyers real-time "Stage 2/6 ✓" feedback.
- **Phase 2 (weeks 2–3):** per-token streaming for 4 services (case-doc-gen, legal-copilot, intelligence-router T3, legal-intelligence text fields). ~780 LOC. Requires new frontend component + per-request SSE endpoints + AbortController wiring.
- **Biggest risks:** JWT-expiry-mid-stream (medium), rate-limit ceiling under chat load (raise limits), client abort not plumbed to SDK (must wire `req.signal` end-to-end).

---

*Audit complete. No code changes. File uncommitted. Prod v290 / staging v13 untouched.*
