import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

// Sub-agent definitions
const AGENTS: Record<string, { name: string; keywords: string[]; queryFn: (tenantId: string, q: string) => Promise<string> }> = {
  compliance: {
    name: "Compliance Agent", keywords: ["permit", "expir", "trc", "compliance", "bhp", "medical", "document", "valid"],
    queryFn: async (tenantId, q) => {
      const permits = await query<Record<string, any>>("SELECT worker_name, permit_type, expiry_date, status FROM immigration_permits WHERE tenant_id = $1 AND status = 'active' ORDER BY expiry_date ASC LIMIT 10", [tenantId]);
      return `Active permits: ${permits.length}. ${permits.slice(0, 5).map(p => `${p.worker_name}: ${p.permit_type} expires ${p.expiry_date ? new Date(p.expiry_date).toLocaleDateString("en-GB") : "N/A"}`).join("; ")}`;
    },
  },
  payroll: {
    name: "Payroll Agent", keywords: ["salary", "payroll", "zus", "tax", "pay", "rate", "cost", "advance"],
    queryFn: async (tenantId, q) => {
      const workers = await fetchAllWorkers(tenantId);
      const mapped = workers.map(mapRowToWorker);
      const totalGross = mapped.reduce((s, w) => s + (w.hourlyRate ?? 0) * (w.monthlyHours ?? 0), 0);
      return `${mapped.length} workers on payroll. Total monthly gross: ${totalGross.toFixed(0)} PLN. Average rate: ${mapped.length > 0 ? (mapped.reduce((s, w) => s + (w.hourlyRate ?? 0), 0) / mapped.length).toFixed(2) : 0} PLN/h.`;
    },
  },
  immigration: {
    name: "Immigration Agent", keywords: ["immigra", "visa", "work permit", "trc", "a1", "posted", "foreign"],
    queryFn: async (tenantId, q) => {
      const kb = await query<Record<string, any>>("SELECT title, content FROM legal_knowledge WHERE tenant_id = $1 AND category IN ('TRC','Work Permit','A1 Certificate','Posted Workers') LIMIT 5", [tenantId]);
      return kb.map(a => `[${a.title}]: ${a.content.slice(0, 150)}`).join("\n");
    },
  },
  workforce: {
    name: "Workforce Agent", keywords: ["worker", "available", "bench", "match", "skill", "site", "assign", "who"],
    queryFn: async (tenantId, q) => {
      const workers = await fetchAllWorkers(tenantId);
      const mapped = workers.map(mapRowToWorker);
      const bench = await query<Record<string, any>>("SELECT COUNT(*) AS c FROM bench_entries WHERE tenant_id = $1 AND status = 'available'", [tenantId]);
      const sites: Record<string, number> = {};
      mapped.forEach(w => { const s = w.assignedSite || "Unassigned"; sites[s] = (sites[s] || 0) + 1; });
      return `${mapped.length} total workers. ${bench[0]?.c || 0} on bench. Sites: ${Object.entries(sites).map(([k, v]) => `${k}(${v})`).join(", ")}`;
    },
  },
  legal: {
    name: "Legal Agent", keywords: ["law", "legal", "regulation", "kodeks", "gdpr", "rodo", "pit", "contract"],
    queryFn: async (tenantId, q) => {
      const articles = await query<Record<string, any>>("SELECT title, content FROM legal_knowledge WHERE tenant_id = $1 ORDER BY category LIMIT 10", [tenantId]);
      const relevant = articles.filter(a => q.toLowerCase().split(" ").some(w => w.length > 3 && (a.title + a.content).toLowerCase().includes(w)));
      return relevant.length > 0 ? relevant.map(a => `[${a.title}]: ${a.content.slice(0, 200)}`).join("\n") : "No matching legal articles found.";
    },
  },
  finance: {
    name: "Finance Agent", keywords: ["revenue", "margin", "invoice", "profit", "cost", "roi", "forecast"],
    queryFn: async (tenantId, q) => {
      const inv = await queryOne<Record<string, any>>("SELECT COUNT(*) AS c, COALESCE(SUM(total::numeric), 0) AS total FROM invoices WHERE tenant_id = $1", [tenantId]);
      const margin = await queryOne<Record<string, any>>("SELECT ROUND(AVG(gross_margin_pct)::numeric, 1) AS avg FROM margin_analysis WHERE tenant_id = $1", [tenantId]);
      return `${inv?.c || 0} invoices totalling €${Number(inv?.total || 0).toLocaleString()}. Average margin: ${margin?.avg || "N/A"}%.`;
    },
  },
};

// Route query to correct agents
function routeQuery(q: string): string[] {
  const lower = q.toLowerCase();
  const matched: string[] = [];
  for (const [id, agent] of Object.entries(AGENTS)) {
    if (agent.keywords.some(kw => lower.includes(kw))) matched.push(id);
  }
  return matched.length > 0 ? matched : ["workforce", "compliance"]; // default
}

// POST /api/ai/query
router.post("/ai/query", requireAuth, async (req, res) => {
  try {
    const { query: userQuery } = req.body as { query?: string };
    if (!userQuery) return res.status(400).json({ error: "query required" });

    const startTime = Date.now();
    const tenantId = req.tenantId!;
    const agentIds = routeQuery(userQuery);

    // Run agents in parallel
    const agentResults: Record<string, string> = {};
    await Promise.all(agentIds.map(async id => {
      try { agentResults[id] = await AGENTS[id].queryFn(tenantId, userQuery); }
      catch { agentResults[id] = "Agent error"; }
    }));

    // Synthesise with Claude
    let finalAnswer = Object.entries(agentResults).map(([id, r]) => `[${AGENTS[id].name}]: ${r}`).join("\n\n");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6", max_tokens: 1024,
          system: "You are an AI copilot for a workforce management platform. Synthesise the agent results below into a clear, concise answer to the user's question. Be direct and actionable.",
          messages: [{ role: "user", content: `Question: ${userQuery}\n\nAgent Results:\n${Object.entries(agentResults).map(([id, r]) => `${AGENTS[id].name}: ${r}`).join("\n\n")}` }],
        });
        finalAnswer = response.content[0]?.type === "text" ? response.content[0].text : finalAnswer;
      } catch { /* use raw results */ }
    }

    const responseTime = Date.now() - startTime;

    // Log query
    await execute(
      "INSERT INTO agent_queries (tenant_id, user_id, query, agents_used, results, final_answer, response_time_ms) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [tenantId, (req as any).user?.email || "unknown", userQuery, JSON.stringify(agentIds.map(id => AGENTS[id].name)), JSON.stringify(agentResults), finalAnswer, responseTime]
    );

    res.json({ answer: finalAnswer, agentsUsed: agentIds.map(id => AGENTS[id].name), responseTimeMs: responseTime });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/ai/queries
router.get("/ai/queries", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT * FROM agent_queries WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50", [req.tenantId!]);
    res.json({ queries: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/ai/index — index platform data into knowledge graph
router.post("/ai/index", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    await execute("DELETE FROM knowledge_nodes WHERE tenant_id = $1", [tenantId]);

    let indexed = 0;
    // Index workers
    const workers = await fetchAllWorkers(tenantId);
    for (const w of workers.map(mapRowToWorker)) {
      await execute("INSERT INTO knowledge_nodes (tenant_id, entity_type, entity_id, entity_name, content, metadata) VALUES ($1,'worker',$2,$3,$4,$5)",
        [tenantId, w.id, w.name, `Worker ${w.name}, ${w.specialization || "General"}, site: ${w.assignedSite || "unassigned"}, rate: ${w.hourlyRate || 0}/h`,
         JSON.stringify({ specialization: w.specialization, site: w.assignedSite, rate: w.hourlyRate })]);
      indexed++;
    }
    // Index permits
    const permits = await query<Record<string, any>>("SELECT * FROM immigration_permits WHERE tenant_id = $1", [tenantId]);
    for (const p of permits) {
      await execute("INSERT INTO knowledge_nodes (tenant_id, entity_type, entity_id, entity_name, content) VALUES ($1,'permit',$2,$3,$4)",
        [tenantId, p.id, p.worker_name, `${p.permit_type} for ${p.worker_name}, country: ${p.country}, expires: ${p.expiry_date}, status: ${p.status}`]);
      indexed++;
    }
    // Index clients
    const clients = await query<Record<string, any>>("SELECT * FROM crm_companies WHERE tenant_id = $1", [tenantId]);
    for (const c of clients) {
      await execute("INSERT INTO knowledge_nodes (tenant_id, entity_type, entity_id, entity_name, content) VALUES ($1,'client',$2,$3,$4)",
        [tenantId, c.id, c.company_name, `Client ${c.company_name}, NIP: ${c.nip || "N/A"}, country: ${c.country}`]);
      indexed++;
    }

    res.json({ indexed, types: { workers: workers.length, permits: permits.length, clients: clients.length } });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/ai/status
router.get("/ai/status", requireAuth, async (req, res) => {
  try {
    const nodes = await query<Record<string, any>>("SELECT entity_type, COUNT(*) AS count FROM knowledge_nodes WHERE tenant_id = $1 GROUP BY entity_type", [req.tenantId!]);
    const total = nodes.reduce((s, n) => s + Number(n.count), 0);
    const queries = await queryOne<Record<string, any>>("SELECT COUNT(*) AS count, ROUND(AVG(response_time_ms)::numeric) AS avg_ms FROM agent_queries WHERE tenant_id = $1", [req.tenantId!]);
    res.json({
      knowledgeGraph: { totalNodes: total, byType: nodes },
      queries: { total: Number(queries?.count ?? 0), avgResponseMs: Number(queries?.avg_ms ?? 0) },
      agents: Object.entries(AGENTS).map(([id, a]) => ({ id, name: a.name, keywords: a.keywords })),
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
