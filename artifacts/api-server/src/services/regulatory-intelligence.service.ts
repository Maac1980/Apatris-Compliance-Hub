/**
 * Regulatory Intelligence Service — Stage 1 (Observe Layer)
 *
 * Source Registry: manage monitored regulatory sources
 * Ingestion: fetch, normalize, hash, deduplicate, store
 * Status model: NEW → INGESTED / DUPLICATE / ARCHIVED
 *
 * NO classification, NO AI summaries treated as truth,
 * NO worker/case impact changes, NO notifications.
 * Stage 1 is read-only relative to the operational legal engine.
 */

import { query, queryOne, execute } from "../lib/db.js";
import crypto from "crypto";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export interface RegulatorySource {
  id: string; name: string; source_type: string; base_url: string;
  jurisdiction: string; trust_level: string; polling_frequency: string;
  parser_config_json: any; language: string; active: boolean;
  last_scanned_at: string | null; last_error: string | null;
}

export interface IngestedUpdate {
  id: string; source_id: string | null; canonical_url: string | null;
  title: string; raw_text: string; content_hash: string | null;
  language: string; publication_date: string | null; detected_at: string;
  severity: string; status: string; summary_pl: string; summary_en: string;
  authority_name: string | null; jurisdiction: string;
}

export interface ScanResult {
  sourceId: string; sourceName: string;
  status: "success" | "failed" | "skipped";
  itemsFound: number; itemsIngested: number; duplicates: number;
  error?: string;
}

// ═══ SOURCE REGISTRY ════════════════════════════════════════════════════════

export async function listSources(): Promise<RegulatorySource[]> {
  return query<RegulatorySource>("SELECT * FROM regulatory_sources ORDER BY name");
}

export async function getSource(id: string): Promise<RegulatorySource | null> {
  return queryOne<RegulatorySource>("SELECT * FROM regulatory_sources WHERE id = $1", [id]);
}

export async function createSource(data: Partial<RegulatorySource>): Promise<RegulatorySource> {
  const row = await queryOne<RegulatorySource>(
    `INSERT INTO regulatory_sources (name, source_type, base_url, jurisdiction, trust_level, polling_frequency, parser_config_json, language, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
    [data.name, data.source_type ?? "rss", data.base_url, data.jurisdiction ?? "PL",
     data.trust_level ?? "official", data.polling_frequency ?? "daily",
     JSON.stringify(data.parser_config_json ?? {}), data.language ?? "pl", data.active ?? true]
  );
  return row!;
}

export async function updateSource(id: string, data: Partial<RegulatorySource>): Promise<RegulatorySource | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.base_url !== undefined) { fields.push(`base_url = $${idx++}`); values.push(data.base_url); }
  if (data.source_type !== undefined) { fields.push(`source_type = $${idx++}`); values.push(data.source_type); }
  if (data.jurisdiction !== undefined) { fields.push(`jurisdiction = $${idx++}`); values.push(data.jurisdiction); }
  if (data.trust_level !== undefined) { fields.push(`trust_level = $${idx++}`); values.push(data.trust_level); }
  if (data.polling_frequency !== undefined) { fields.push(`polling_frequency = $${idx++}`); values.push(data.polling_frequency); }
  if (data.active !== undefined) { fields.push(`active = $${idx++}`); values.push(data.active); }
  if (data.language !== undefined) { fields.push(`language = $${idx++}`); values.push(data.language); }
  if (data.parser_config_json !== undefined) { fields.push(`parser_config_json = $${idx++}::jsonb`); values.push(JSON.stringify(data.parser_config_json)); }

  if (fields.length === 0) return null;
  fields.push("updated_at = NOW()");
  values.push(id);

  return queryOne<RegulatorySource>(`UPDATE regulatory_sources SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, values);
}

// ═══ INGESTION SERVICE ══════════════════════════════════════════════════════

export async function runFullScan(): Promise<{ results: ScanResult[]; totalIngested: number; totalDuplicates: number }> {
  const sources = await query<RegulatorySource>("SELECT * FROM regulatory_sources WHERE active = true ORDER BY name");
  const results: ScanResult[] = [];
  let totalIngested = 0;
  let totalDuplicates = 0;

  for (const source of sources) {
    try {
      console.log(`[regulatory] Scanning: ${source.name} (${source.base_url})`);
      const result = await scanSource(source);
      results.push(result);
      totalIngested += result.itemsIngested;
      totalDuplicates += result.duplicates;

      await execute("UPDATE regulatory_sources SET last_scanned_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1", [source.id]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[regulatory] Failed: ${source.name}: ${errMsg}`);
      results.push({ sourceId: source.id, sourceName: source.name, status: "failed", itemsFound: 0, itemsIngested: 0, duplicates: 0, error: errMsg });
      await execute("UPDATE regulatory_sources SET last_error = $1, updated_at = NOW() WHERE id = $2", [errMsg, source.id]);
    }
  }

  console.log(`[regulatory] Scan complete: ${results.length} sources, ${totalIngested} ingested, ${totalDuplicates} duplicates`);
  return { results, totalIngested, totalDuplicates };
}

async function scanSource(source: RegulatorySource): Promise<ScanResult> {
  const result: ScanResult = { sourceId: source.id, sourceName: source.name, status: "success", itemsFound: 0, itemsIngested: 0, duplicates: 0 };

  let items: Array<{ title: string; url: string; text: string; html: string; pubDate: string | null }> = [];

  if (source.source_type === "rss") {
    items = await fetchRSS(source.base_url);
  } else if (source.source_type === "page") {
    items = await fetchPage(source.base_url, source.name);
  } else {
    result.status = "skipped";
    return result;
  }

  result.itemsFound = items.length;

  for (const item of items) {
    const hash = computeHash(item.title + item.text);

    // Dedup: check hash
    const hashMatch = await queryOne<any>("SELECT id FROM regulatory_ingested WHERE content_hash = $1", [hash]);
    if (hashMatch) { result.duplicates++; continue; }

    // Dedup: check URL
    if (item.url) {
      const urlMatch = await queryOne<any>("SELECT id FROM regulatory_ingested WHERE canonical_url = $1", [item.url]);
      if (urlMatch) { result.duplicates++; continue; }
    }

    // Dedup: lightweight title similarity (exact match)
    const titleMatch = await queryOne<any>("SELECT id FROM regulatory_ingested WHERE LOWER(title) = LOWER($1) AND source_id = $2", [item.title, source.id]);
    if (titleMatch) { result.duplicates++; continue; }

    // Ingest
    await execute(
      `INSERT INTO regulatory_ingested (source_id, canonical_url, title, raw_text, raw_html, content_hash, language, publication_date, detected_at, authority_name, jurisdiction, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,'NEW')`,
      [source.id, item.url || null, item.title, item.text, item.html, hash, source.language, item.pubDate, source.name, source.jurisdiction]
    );
    result.itemsIngested++;
  }

  return result;
}

// ═══ FETCH HELPERS ══════════════════════════════════════════════════════════

async function fetchRSS(url: string): Promise<Array<{ title: string; url: string; text: string; html: string; pubDate: string | null }>> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Apatris-Regulatory-Monitor/1.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    // Simple RSS/Atom parser — extract <item> or <entry> blocks
    const items: Array<{ title: string; url: string; text: string; html: string; pubDate: string | null }> = [];
    const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];

    for (const block of itemMatches.slice(0, 50)) {
      const title = extractTag(block, "title");
      const link = extractTag(block, "link") || extractAttr(block, "link", "href");
      const description = extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");
      const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");

      if (title) {
        items.push({
          title: stripCDATA(title).slice(0, 500),
          url: stripCDATA(link ?? ""),
          text: stripHTML(stripCDATA(description ?? "")).slice(0, 5000),
          html: stripCDATA(description ?? "").slice(0, 10000),
          pubDate: pubDate ? normalizeDate(pubDate) : null,
        });
      }
    }
    return items;
  } catch (err) {
    console.error(`[regulatory] RSS fetch failed for ${url}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchPage(url: string, sourceName: string): Promise<Array<{ title: string; url: string; text: string; html: string; pubDate: string | null }>> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Apatris-Regulatory-Monitor/1.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = stripHTML(html).slice(0, 20000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? sourceName).slice(0, 500);

    return [{ title: stripHTML(title), url, text, html: html.slice(0, 50000), pubDate: null }];
  } catch (err) {
    console.error(`[regulatory] Page fetch failed for ${url}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ═══ HELPERS ════════════════════════════════════════════════════════════════

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i"));
  return match?.[1] ?? null;
}

function stripCDATA(text: string): string {
  return text.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function normalizeDate(dateStr: string): string | null {
  try {
    const d = new Date(dateStr.trim());
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch { return null; }
}

// ═══ READ OPERATIONS ════════════════════════════════════════════════════════

export async function listUpdates(filters?: { status?: string; sourceId?: string; limit?: number }): Promise<IngestedUpdate[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
  if (filters?.sourceId) { conditions.push(`source_id = $${idx++}`); params.push(filters.sourceId); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters?.limit ?? 100;

  return query<IngestedUpdate>(`SELECT ri.*, rs.name as source_name FROM regulatory_ingested ri LEFT JOIN regulatory_sources rs ON rs.id = ri.source_id ${where} ORDER BY ri.detected_at DESC LIMIT ${limit}`, params);
}

export async function getUpdate(id: string): Promise<IngestedUpdate | null> {
  return queryOne<IngestedUpdate>("SELECT ri.*, rs.name as source_name FROM regulatory_ingested ri LEFT JOIN regulatory_sources rs ON rs.id = ri.source_id WHERE ri.id = $1", [id]);
}

// ═══ SOURCE SEED ════════════════════════════════════════════════════════════

export async function seedDefaultSources(): Promise<number> {
  const existing = await query<{ count: string }>("SELECT COUNT(*)::int as count FROM regulatory_sources");
  if (parseInt(existing[0]?.count ?? "0") > 3) return 0;

  const sources = [
    // Government official sources
    { name: "GOV.PL — Cudzoziemcy", type: "page", url: "https://www.gov.pl/web/cudzoziemcy", jurisdiction: "PL", trust: "official", lang: "pl" },
    { name: "GOV.PL — Praca", type: "page", url: "https://www.gov.pl/web/rodzina/kategoria/praca", jurisdiction: "PL", trust: "official", lang: "pl" },
    { name: "Praca.gov.pl — Aktualności", type: "page", url: "https://www.praca.gov.pl/eurzad/index.eup#/aktualnosci", jurisdiction: "PL", trust: "official", lang: "pl" },
    { name: "Biznes.gov.pl — Zatrudnianie cudzoziemców", type: "page", url: "https://www.biznes.gov.pl/pl/portal/003070", jurisdiction: "PL", trust: "official", lang: "pl" },
    { name: "UdSC — Aktualności", type: "page", url: "https://www.gov.pl/web/udsc/aktualnosci", jurisdiction: "PL", trust: "official", lang: "pl" },
    // Ministry sources
    { name: "MRiPS — Ministerstwo Pracy", type: "page", url: "https://www.gov.pl/web/rodzina", jurisdiction: "PL", trust: "official", lang: "pl" },
    { name: "MSWiA — Sprawy cudzoziemców", type: "page", url: "https://www.gov.pl/web/mswia", jurisdiction: "PL", trust: "official", lang: "pl" },
    // Voivodeship / migration
    { name: "Mazowiecki UW — Cudzoziemcy", type: "page", url: "https://www.gov.pl/web/uw-mazowiecki/cudzoziemcy2", jurisdiction: "PL-MZ", trust: "official", lang: "pl" },
    { name: "Pomorski UW — Cudzoziemcy", type: "page", url: "https://www.gov.pl/web/uw-pomorski/cudzoziemcy", jurisdiction: "PL-PM", trust: "official", lang: "pl" },
    // Legal databases
    { name: "ISAP — Dziennik Ustaw", type: "rss", url: "https://isap.sejm.gov.pl/isap.nsf/feed.xsp/WDU", jurisdiction: "PL", trust: "primary_law", lang: "pl" },
    { name: "ISAP — Monitor Polski", type: "rss", url: "https://isap.sejm.gov.pl/isap.nsf/feed.xsp/WMP", jurisdiction: "PL", trust: "primary_law", lang: "pl" },
    // EU sources
    { name: "EUR-Lex — Free Movement Workers", type: "rss", url: "https://eur-lex.europa.eu/rss/rss.xml", jurisdiction: "EU", trust: "primary_law", lang: "en" },
    // Inspection / enforcement
    { name: "PIP — Państwowa Inspekcja Pracy", type: "page", url: "https://www.pip.gov.pl/pl/wiadomosci/", jurisdiction: "PL", trust: "official", lang: "pl" },
    { name: "ZUS — Aktualności", type: "page", url: "https://www.zus.pl/o-zus/aktualnosci", jurisdiction: "PL", trust: "official", lang: "pl" },
    // Secondary trusted sources
    { name: "LEX.pl — Prawo imigracyjne", type: "page", url: "https://www.lex.pl/immigration", jurisdiction: "PL", trust: "secondary", lang: "pl" },
  ];

  let seeded = 0;
  for (const s of sources) {
    try {
      await execute(
        `INSERT INTO regulatory_sources (name, source_type, base_url, jurisdiction, trust_level, language, active)
         VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT DO NOTHING`,
        [s.name, s.type, s.url, s.jurisdiction, s.trust, s.lang]
      );
      seeded++;
    } catch {}
  }

  console.log(`[regulatory] Seeded ${seeded} default sources`);
  return seeded;
}
