/**
 * Regulatory Ingestion Service
 * Fetches, normalizes, hashes, deduplicates, and stores regulatory updates.
 *
 * Status model: NEW | DUPLICATE | ARCHIVED | INGESTED
 * No other statuses allowed in Stage 1.
 *
 * NO side effects: no worker updates, no case updates, no legal engine interaction.
 */

import { query, queryOne, execute } from "../lib/db.js";
import type { RegulatorySource } from "./regulatory-source-registry.service.js";
import { classifyAndPersist } from "./regulatory-classification.service.js";
import { extractAndPersist } from "./regulatory-extraction.service.js";
import { mapImpact, simulateImpact } from "./regulatory-impact.service.js";
import { createReviewTasks } from "./regulatory-review.service.js";
import { advanceStage } from "./ooda-engine.service.js";
import crypto from "crypto";

export interface ScanResult {
  sourceId: string; sourceName: string;
  status: "success" | "failed" | "skipped";
  itemsFound: number; itemsIngested: number; duplicates: number;
  error?: string;
}

export interface IngestedUpdate {
  id: string; source_id: string | null; canonical_url: string | null;
  title: string; raw_text: string; content_hash: string | null;
  language: string; publication_date: string | null; detected_at: string;
  severity: string; status: string; summary_pl: string; summary_en: string;
  authority_name: string | null; jurisdiction: string; source_name?: string;
}

// ═══ FULL SCAN ══════════════════════════════════════════════════════════════

export async function runFullScan(): Promise<{ results: ScanResult[]; totalIngested: number; totalDuplicates: number }> {
  const sources = await query<RegulatorySource>("SELECT * FROM regulatory_sources WHERE active = true ORDER BY name");
  const results: ScanResult[] = [];
  let totalIngested = 0;
  let totalDuplicates = 0;

  for (const source of sources) {
    console.log(`[regulatory] Scan started: ${source.name}`);
    try {
      const result = await scanSource(source);
      results.push(result);
      totalIngested += result.itemsIngested;
      totalDuplicates += result.duplicates;
      await execute("UPDATE regulatory_sources SET last_scanned_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1", [source.id]);
      console.log(`[regulatory] Scan completed: ${source.name} — ${result.itemsIngested} ingested, ${result.duplicates} duplicates`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[regulatory] Scan failed: ${source.name}: ${errMsg}`);
      results.push({ sourceId: source.id, sourceName: source.name, status: "failed", itemsFound: 0, itemsIngested: 0, duplicates: 0, error: errMsg });
      await execute("UPDATE regulatory_sources SET last_error = $1, updated_at = NOW() WHERE id = $2", [errMsg, source.id]);
    }
  }

  console.log(`[regulatory] Full scan complete: ${results.length} sources, ${totalIngested} ingested, ${totalDuplicates} duplicates`);
  return { results, totalIngested, totalDuplicates };
}

// ═══ SINGLE SOURCE SCAN ═════════════════════════════════════════════════════

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
    let isDuplicate = false;

    // Dedup 1: content hash
    const hashMatch = await queryOne<any>("SELECT id FROM regulatory_updates WHERE content_hash = $1 AND status != 'DUPLICATE'", [hash]);
    if (hashMatch) isDuplicate = true;

    // Dedup 2: canonical URL
    if (!isDuplicate && item.url) {
      const urlMatch = await queryOne<any>("SELECT id FROM regulatory_updates WHERE canonical_url = $1 AND status != 'DUPLICATE'", [item.url]);
      if (urlMatch) isDuplicate = true;
    }

    // Dedup 3: exact title + same source
    if (!isDuplicate) {
      const titleMatch = await queryOne<any>("SELECT id FROM regulatory_updates WHERE LOWER(title) = LOWER($1) AND source_id = $2 AND status != 'DUPLICATE'", [item.title, source.id]);
      if (titleMatch) isDuplicate = true;
    }

    if (isDuplicate) {
      // Persist duplicate row for audit visibility — minimal fields, status DUPLICATE
      await execute(
        `INSERT INTO regulatory_updates (source_id, canonical_url, title, content_hash, language, detected_at, authority_name, jurisdiction, status, source)
         VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,'DUPLICATE',$8)`,
        [source.id, item.url || null, item.title, hash, source.language, source.name, source.jurisdiction, source.name]
      );
      result.duplicates++;
      console.log(`[regulatory] Duplicate detected: "${item.title.slice(0, 60)}..." from ${source.name}`);
      continue;
    }

    // Ingest with status NEW
    const inserted = await queryOne<{ id: string }>(
      `INSERT INTO regulatory_updates (source_id, canonical_url, title, raw_text, raw_html, content_hash, language, publication_date, detected_at, authority_name, jurisdiction, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,'NEW',$11) RETURNING id`,
      [source.id, item.url || null, item.title, item.text, item.html, hash, source.language, item.pubDate, source.name, source.jurisdiction, source.name]
    );
    result.itemsIngested++;
    console.log(`[regulatory] Ingested: "${item.title.slice(0, 60)}..." from ${source.name}`);

    // Full pipeline (failures at each stage don't break others)
    if (inserted?.id) {
      // OODA: OBSERVE
      try { await advanceStage("REGULATORY", inserted.id, "OBSERVE", `Ingested from ${source.name}`); } catch {}

      // Stage 2: classify + extract → ORIENT
      try { await classifyAndPersist(inserted.id); } catch (err) { console.error(`[regulatory] Classification failed for ${inserted.id}:`, err instanceof Error ? err.message : err); }
      try { await extractAndPersist(inserted.id); } catch (err) { console.error(`[regulatory] Extraction failed for ${inserted.id}:`, err instanceof Error ? err.message : err); }
      try { await advanceStage("REGULATORY", inserted.id, "ORIENT", "Classified and extracted"); } catch {}

      // Stage 3: impact mapping + simulation → DECIDE
      try { await mapImpact(inserted.id); } catch (err) { console.error(`[regulatory] Impact mapping failed for ${inserted.id}:`, err instanceof Error ? err.message : err); }
      try { await simulateImpact(inserted.id); } catch (err) { console.error(`[regulatory] Simulation failed for ${inserted.id}:`, err instanceof Error ? err.message : err); }
      try { await advanceStage("REGULATORY", inserted.id, "DECIDE", "Impact mapped and simulated"); } catch {}

      // Stage 4: create review tasks
      try { await createReviewTasks(inserted.id); } catch (err) { console.error(`[regulatory] Review task creation failed for ${inserted.id}:`, err instanceof Error ? err.message : err); }
    }
  }

  return result;
}

// ═══ FETCH HELPERS ══════════════════════════════════════════════════════════

async function fetchRSS(url: string): Promise<Array<{ title: string; url: string; text: string; html: string; pubDate: string | null }>> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Apatris-Regulatory-Monitor/1.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

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
    console.error(`[regulatory] RSS fetch failed: ${url}: ${err instanceof Error ? err.message : err}`);
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
    console.error(`[regulatory] Page fetch failed: ${url}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// ═══ UTILITIES ══════════════════════════════════════════════════════════════

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

function stripCDATA(text: string): string { return text.replace(/<!\[CDATA\[|\]\]>/g, "").trim(); }
function stripHTML(html: string): string { return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim(); }

function normalizeDate(dateStr: string): string | null {
  try { const d = new Date(dateStr.trim()); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); } catch { return null; }
}

// ═══ READ OPERATIONS ════════════════════════════════════════════════════════

export async function listUpdates(filters?: { status?: string; sourceId?: string; limit?: number }): Promise<IngestedUpdate[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.status) { conditions.push(`ru.status = $${idx++}`); params.push(filters.status); }
  if (filters?.sourceId) { conditions.push(`ru.source_id = $${idx++}`); params.push(filters.sourceId); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters?.limit ?? 100;

  return query<IngestedUpdate>(`SELECT ru.*, rs.name as source_name FROM regulatory_updates ru LEFT JOIN regulatory_sources rs ON rs.id = ru.source_id ${where} ORDER BY ru.detected_at DESC NULLS LAST, ru.fetched_at DESC NULLS LAST LIMIT ${limit}`, params);
}

export async function getUpdate(id: string): Promise<IngestedUpdate | null> {
  return queryOne<IngestedUpdate>("SELECT ru.*, rs.name as source_name FROM regulatory_updates ru LEFT JOIN regulatory_sources rs ON rs.id = ru.source_id WHERE ru.id = $1", [id]);
}
