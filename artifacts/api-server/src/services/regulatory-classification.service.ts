/**
 * Regulatory Classification Service — Stage 2
 *
 * Deterministic rules + AI-assisted classification of regulatory updates.
 * Classifies: relevance, severity, update type, language.
 *
 * NO legal engine changes. NO worker/case updates. Classification only.
 */

import { execute, queryOne } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type RelevanceCategory =
  | "immigration" | "residence_card" | "work_permit" | "labor_law"
  | "payroll_zus" | "gdpr" | "compliance" | "employer_obligations";

export type SeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NO_IMPACT";

export type UpdateType =
  | "NEW_LAW" | "AMENDMENT" | "GUIDANCE" | "COURT_DECISION"
  | "ADMINISTRATIVE_CHANGE" | "PROCESS_CHANGE" | "DOCUMENTATION_CHANGE"
  | "CONSULTATION" | "DEADLINE_UPDATE";

export interface ClassificationResult {
  relevanceCategories: RelevanceCategory[];
  relevanceScore: number;
  severity: SeverityLevel;
  updateType: UpdateType;
  language: string;
  confidence: number;
  requiresHumanReview: boolean;
}

// ═══ KEYWORD MAPS (deterministic layer) ═════════════════════════════════════

const RELEVANCE_KEYWORDS: Record<RelevanceCategory, string[]> = {
  immigration: ["cudzoziemiec", "cudzoziemców", "foreigner", "immigration", "pobyt", "wiza", "visa", "deportac"],
  residence_card: ["karta pobytu", "zezwolenie na pobyt", "trc", "residence card", "temporary residence", "art. 98", "art. 100", "art. 108"],
  work_permit: ["zezwolenie na pracę", "work permit", "oświadczenie", "praca cudzoziemca", "art. 88", "type a permit"],
  labor_law: ["kodeks pracy", "labor law", "prawo pracy", "umowa o pracę", "employment contract", "working time", "czas pracy"],
  payroll_zus: ["zus", "składk", "contribution", "pit", "podatek", "tax", "wynagrodzeni", "salary", "płaca minimalna", "minimum wage"],
  gdpr: ["rodo", "gdpr", "dane osobowe", "personal data", "ochrona danych", "data protection"],
  compliance: ["pip", "inspekcja pracy", "labor inspection", "compliance", "kara", "fine", "grzywna", "penalty", "kontrola"],
  employer_obligations: ["pracodawc", "employer", "obowiązek", "obligation", "zgłoszenie", "reporting", "rejestracja", "registration"],
};

const SEVERITY_KEYWORDS: Record<string, string[]> = {
  CRITICAL: ["wchodzi w życie", "enters into force", "obowiązkow", "mandatory", "natychmiast", "immediately", "kara", "fine", "grzywna", "penalty", "zakaz", "prohibition"],
  HIGH: ["zmiana", "change", "nowelizacja", "amendment", "nowe wymagania", "new requirements", "termin", "deadline"],
  MEDIUM: ["wytyczne", "guidance", "zaleceni", "recommendation", "informacja", "information"],
};

const UPDATE_TYPE_KEYWORDS: Record<string, string[]> = {
  NEW_LAW: ["nowa ustawa", "new law", "new act", "uchwalono", "enacted"],
  AMENDMENT: ["nowelizacja", "amendment", "zmiana ustawy", "zmiana przepis", "zmieniono"],
  GUIDANCE: ["wytyczne", "guidance", "interpretacja", "interpretation", "stanowisko", "opinion"],
  COURT_DECISION: ["wyrok", "judgment", "orzeczenie", "ruling", "sąd", "court", "trybunał", "tribunal"],
  ADMINISTRATIVE_CHANGE: ["zmiana procedur", "procedural change", "nowy formularz", "new form", "system", "portal"],
  PROCESS_CHANGE: ["zmiana procesu", "process change", "nowy tryb", "new procedure"],
  DOCUMENTATION_CHANGE: ["nowy dokument", "new document", "zmiana formularza", "form change"],
  DEADLINE_UPDATE: ["termin", "deadline", "przedłużeni", "extension", "przesunięci", "postponement"],
  CONSULTATION: ["konsultacj", "consultation", "projekt", "draft", "opiniowanie"],
};

// ═══ DETERMINISTIC CLASSIFICATION ═══════════════════════════════════════════

export function classifyDeterministic(title: string, text: string): Partial<ClassificationResult> {
  const content = (title + " " + text).toLowerCase();

  // Relevance
  const relevanceCategories: RelevanceCategory[] = [];
  let relevanceScore = 0;
  for (const [category, keywords] of Object.entries(RELEVANCE_KEYWORDS)) {
    const matchCount = keywords.filter(k => content.includes(k)).length;
    if (matchCount > 0) {
      relevanceCategories.push(category as RelevanceCategory);
      relevanceScore += matchCount * 15;
    }
  }
  relevanceScore = Math.min(100, relevanceScore);

  // Severity
  let severity: SeverityLevel = "LOW";
  if (SEVERITY_KEYWORDS.CRITICAL.some(k => content.includes(k))) severity = "CRITICAL";
  else if (SEVERITY_KEYWORDS.HIGH.some(k => content.includes(k))) severity = "HIGH";
  else if (SEVERITY_KEYWORDS.MEDIUM.some(k => content.includes(k))) severity = "MEDIUM";

  if (relevanceScore === 0) severity = "NO_IMPACT";

  // Update type
  let updateType: UpdateType = "GUIDANCE";
  for (const [type, keywords] of Object.entries(UPDATE_TYPE_KEYWORDS)) {
    if (keywords.some(k => content.includes(k))) { updateType = type as UpdateType; break; }
  }

  // Language
  const plCount = (content.match(/jest|nie|się|dla|przez|oraz|został/g) ?? []).length;
  const enCount = (content.match(/\bthe\b|\bis\b|\bfor\b|\band\b|\bwas\b|\bwith\b/g) ?? []).length;
  const language = plCount > enCount ? "pl" : enCount > plCount ? "en" : "pl";

  // Confidence from deterministic
  const confidence = relevanceCategories.length > 0 ? Math.min(70, relevanceScore) : 20;

  return { relevanceCategories, relevanceScore, severity, updateType, language, confidence };
}

// ═══ AI-ASSISTED CLASSIFICATION ═════════════════════════════════════════════

export async function classifyWithAI(title: string, text: string): Promise<ClassificationResult> {
  // Start with deterministic
  const det = classifyDeterministic(title, text);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      relevanceCategories: det.relevanceCategories ?? [],
      relevanceScore: det.relevanceScore ?? 0,
      severity: det.severity ?? "LOW",
      updateType: det.updateType ?? "GUIDANCE",
      language: det.language ?? "pl",
      confidence: det.confidence ?? 20,
      requiresHumanReview: true,
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 1024,
        system: `You classify Polish/EU regulatory updates for an immigration staffing agency. Return ONLY valid JSON:
{
  "relevanceCategories": ["immigration","residence_card","work_permit","labor_law","payroll_zus","gdpr","compliance","employer_obligations"],
  "relevanceScore": 0-100,
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|NO_IMPACT",
  "updateType": "NEW_LAW|AMENDMENT|GUIDANCE|COURT_DECISION|ADMINISTRATIVE_CHANGE|PROCESS_CHANGE|DOCUMENTATION_CHANGE|CONSULTATION|DEADLINE_UPDATE",
  "language": "pl|en",
  "confidence": 0-100
}
Only include relevanceCategories that actually apply. Be conservative with CRITICAL severity.`,
        messages: [{ role: "user", content: `Title: ${title}\n\nContent (first 2000 chars):\n${text.slice(0, 2000)}` }],
      }),
    });

    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json() as any;
    const raw = data.content?.find((b: any) => b.type === "text")?.text ?? "";
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    const validRelevance = ["immigration", "residence_card", "work_permit", "labor_law", "payroll_zus", "gdpr", "compliance", "employer_obligations"];
    const validSeverity = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NO_IMPACT"];
    const validTypes = ["NEW_LAW", "AMENDMENT", "GUIDANCE", "COURT_DECISION", "ADMINISTRATIVE_CHANGE", "PROCESS_CHANGE", "DOCUMENTATION_CHANGE", "CONSULTATION", "DEADLINE_UPDATE"];

    const aiCategories = (json.relevanceCategories ?? []).filter((c: string) => validRelevance.includes(c));
    const aiSeverity = validSeverity.includes(json.severity) ? json.severity : det.severity;
    const aiType = validTypes.includes(json.updateType) ? json.updateType : det.updateType;
    const aiConfidence = typeof json.confidence === "number" ? Math.min(100, Math.max(0, json.confidence)) : 50;

    // Merge: AI takes priority but deterministic provides fallback
    const mergedCategories = aiCategories.length > 0 ? aiCategories : det.relevanceCategories;
    const mergedScore = aiCategories.length > 0 ? (json.relevanceScore ?? det.relevanceScore ?? 50) : det.relevanceScore ?? 0;
    const mergedConfidence = Math.round((aiConfidence * 0.7) + ((det.confidence ?? 20) * 0.3));

    const requiresHumanReview = mergedConfidence < 60 || ["CRITICAL", "HIGH"].includes(aiSeverity);

    return {
      relevanceCategories: mergedCategories as RelevanceCategory[],
      relevanceScore: Math.min(100, mergedScore),
      severity: aiSeverity as SeverityLevel,
      updateType: aiType as UpdateType,
      language: json.language ?? det.language ?? "pl",
      confidence: mergedConfidence,
      requiresHumanReview,
    };
  } catch {
    return {
      relevanceCategories: det.relevanceCategories ?? [],
      relevanceScore: det.relevanceScore ?? 0,
      severity: det.severity ?? "LOW",
      updateType: det.updateType ?? "GUIDANCE",
      language: det.language ?? "pl",
      confidence: det.confidence ?? 20,
      requiresHumanReview: true,
    };
  }
}

// ═══ PERSIST CLASSIFICATION ═════════════════════════════════════════════════

export async function classifyAndPersist(updateId: string): Promise<ClassificationResult | null> {
  const row = await queryOne<any>("SELECT id, title, raw_text, summary FROM regulatory_updates WHERE id = $1", [updateId]);
  if (!row) return null;

  const text = row.raw_text || row.summary || "";
  const result = await classifyWithAI(row.title || "", text);

  await execute(
    `UPDATE regulatory_updates SET
      severity = $1, update_type = $2, relevance_score = $3, confidence_score = $4,
      requires_human_review = $5, language = $6, relevant_topics = $7::jsonb,
      classified_at = NOW(), updated_at = NOW()
     WHERE id = $8`,
    [result.severity, result.updateType, result.relevanceScore, result.confidence,
     result.requiresHumanReview, result.language, JSON.stringify(result.relevanceCategories), updateId]
  );

  return result;
}
