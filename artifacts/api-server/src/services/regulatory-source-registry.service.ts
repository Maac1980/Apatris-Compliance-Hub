/**
 * Regulatory Source Registry Service
 * Manages monitored regulatory/legal update sources.
 */

import { query, queryOne, execute } from "../lib/db.js";

export interface RegulatorySource {
  id: string; name: string; source_type: string; base_url: string;
  jurisdiction: string; trust_level: string; polling_frequency: string;
  parser_config_json: any; language: string; active: boolean;
  last_scanned_at: string | null; last_error: string | null;
}

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

export async function seedDefaultSources(): Promise<number> {
  const existing = await query<{ count: string }>("SELECT COUNT(*)::int as count FROM regulatory_sources");
  if (parseInt(existing[0]?.count ?? "0") > 3) return 0;

  const sources = [
    { name: "GOV.PL — Cudzoziemcy", type: "page", url: "https://www.gov.pl/web/cudzoziemcy", jurisdiction: "PL", trust: "official", freq: "daily", lang: "pl" },
    { name: "GOV.PL — Praca", type: "page", url: "https://www.gov.pl/web/rodzina/kategoria/praca", jurisdiction: "PL", trust: "official", freq: "daily", lang: "pl" },
    { name: "Praca.gov.pl — Aktualności", type: "page", url: "https://www.praca.gov.pl/eurzad/index.eup#/aktualnosci", jurisdiction: "PL", trust: "official", freq: "daily", lang: "pl" },
    { name: "Biznes.gov.pl — Zatrudnianie cudzoziemców", type: "page", url: "https://www.biznes.gov.pl/pl/portal/003070", jurisdiction: "PL", trust: "official", freq: "daily", lang: "pl" },
    { name: "UdSC — Aktualności", type: "page", url: "https://www.gov.pl/web/udsc/aktualnosci", jurisdiction: "PL", trust: "official", freq: "daily", lang: "pl" },
    { name: "MRiPS — Ministerstwo Pracy", type: "page", url: "https://www.gov.pl/web/rodzina", jurisdiction: "PL", trust: "official", freq: "weekly", lang: "pl" },
    { name: "MSWiA — Sprawy cudzoziemców", type: "page", url: "https://www.gov.pl/web/mswia", jurisdiction: "PL", trust: "official", freq: "weekly", lang: "pl" },
    { name: "Mazowiecki UW — Cudzoziemcy", type: "page", url: "https://www.gov.pl/web/uw-mazowiecki/cudzoziemcy2", jurisdiction: "PL-MZ", trust: "official", freq: "daily", lang: "pl" },
    { name: "Pomorski UW — Cudzoziemcy", type: "page", url: "https://www.gov.pl/web/uw-pomorski/cudzoziemcy", jurisdiction: "PL-PM", trust: "official", freq: "daily", lang: "pl" },
    { name: "ISAP — Dziennik Ustaw", type: "rss", url: "https://isap.sejm.gov.pl/isap.nsf/feed.xsp/WDU", jurisdiction: "PL", trust: "primary_law", freq: "daily", lang: "pl" },
    { name: "ISAP — Monitor Polski", type: "rss", url: "https://isap.sejm.gov.pl/isap.nsf/feed.xsp/WMP", jurisdiction: "PL", trust: "primary_law", freq: "daily", lang: "pl" },
    { name: "EUR-Lex — Free Movement Workers", type: "rss", url: "https://eur-lex.europa.eu/rss/rss.xml", jurisdiction: "EU", trust: "primary_law", freq: "weekly", lang: "en" },
    { name: "PIP — Państwowa Inspekcja Pracy", type: "page", url: "https://www.pip.gov.pl/pl/wiadomosci/", jurisdiction: "PL", trust: "official", freq: "daily", lang: "pl" },
    { name: "ZUS — Aktualności", type: "page", url: "https://www.zus.pl/o-zus/aktualnosci", jurisdiction: "PL", trust: "official", freq: "weekly", lang: "pl" },
    { name: "LEX.pl — Prawo imigracyjne", type: "page", url: "https://www.lex.pl/immigration", jurisdiction: "PL", trust: "secondary", freq: "weekly", lang: "pl" },
  ];

  let seeded = 0;
  for (const s of sources) {
    try {
      await execute(
        `INSERT INTO regulatory_sources (name, source_type, base_url, jurisdiction, trust_level, polling_frequency, language, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT DO NOTHING`,
        [s.name, s.type, s.url, s.jurisdiction, s.trust, s.freq, s.lang]
      );
      seeded++;
    } catch {}
  }
  console.log(`[regulatory] Seeded ${seeded} default sources`);
  return seeded;
}
