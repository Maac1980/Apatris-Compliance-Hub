/**
 * AI Use Cases — structured AI-assisted functions.
 *
 * Each use case:
 * - has a rule-based fallback (works without AI)
 * - uses AI only to enhance/explain, never to replace deterministic logic
 * - returns clearly labeled output (aiGenerated: true/false)
 */

import { getProvider } from "./provider.js";
import type { ComplianceSummaryInput, ComplianceSummaryOutput } from "./types.js";

// ═══ COMPLIANCE SUMMARY ═════════════════════════════════════════════════════

/**
 * Generate a plain-language compliance/PIP readiness explanation.
 * Falls back to rule-based text if AI is not available.
 */
export async function generateComplianceSummary(input: ComplianceSummaryInput): Promise<ComplianceSummaryOutput> {
  const provider = getProvider();

  // Rule-based fallback (always works)
  const ruleBased = generateRuleBasedSummary(input);

  if (!provider) {
    return { ...ruleBased, aiGenerated: false };
  }

  // Try AI enhancement
  try {
    const response = await provider.complete({
      system: "You are a Polish labor compliance expert. Write a brief, clear summary in 2-3 sentences for a staffing agency manager. Be specific about risks and actions. Mention PIP (Państwowa Inspekcja Pracy) fine amounts where relevant.",
      prompt: `PIP inspection readiness score: ${input.score}% (${input.riskLevel} risk).
Workers: ${input.totalWorkers}. Expired: ${input.expiredCount}. Critical (<30d): ${input.criticalCount}. Warning (30-60d): ${input.warningCount}. Missing: ${input.missingCount}.
Top risks: ${input.topRisks.slice(0, 5).join("; ")}.
Write a brief management summary and 3 specific action recommendations.`,
      maxTokens: 300,
    });

    if (response.text) {
      // Parse AI response — expect summary + recommendations
      const lines = response.text.split("\n").filter(l => l.trim());
      const summary = lines.slice(0, 3).join(" ");
      const recs = lines.filter(l => l.match(/^[-•\d]/)).map(l => l.replace(/^[-•\d.)\s]+/, "").trim()).slice(0, 3);

      return {
        summary: summary || ruleBased.summary,
        recommendations: recs.length > 0 ? recs : ruleBased.recommendations,
        aiGenerated: true,
      };
    }
  } catch (err) {
    console.error("[AI] Compliance summary failed, using rule-based:", err instanceof Error ? err.message : err);
  }

  return { ...ruleBased, aiGenerated: false };
}

// ═══ RULE-BASED FALLBACK ════════════════════════════════════════════════════

function generateRuleBasedSummary(input: ComplianceSummaryInput): { summary: string; recommendations: string[] } {
  const recs: string[] = [];

  if (input.expiredCount > 0) {
    recs.push(`Renew ${input.expiredCount} expired document(s) immediately — expired work permits carry PIP fines up to 50,000 PLN per worker.`);
  }
  if (input.criticalCount > 0) {
    recs.push(`Schedule renewal for ${input.criticalCount} document(s) expiring within 30 days to avoid compliance gaps.`);
  }
  if (input.missingCount > 0) {
    recs.push(`Upload ${input.missingCount} missing document(s) — BHP training and medical exams are required for all workers on-site.`);
  }
  if (recs.length === 0) {
    recs.push("Maintain current renewal schedule and continue monitoring document expiry dates.");
  }

  const summary = input.score >= 80
    ? `Compliance posture is strong at ${input.score}%. ${input.totalWorkers} workers are largely up-to-date. ${input.warningCount > 0 ? `${input.warningCount} document(s) need attention within 60 days.` : ""}`
    : input.score >= 50
    ? `Compliance needs attention — score is ${input.score}%. ${input.expiredCount + input.criticalCount} document(s) require urgent action to avoid PIP inspection findings.`
    : `Compliance is at high risk — score is ${input.score}%. ${input.expiredCount} expired and ${input.criticalCount} critical document(s) create immediate PIP fine exposure. Prioritize renewals today.`;

  return { summary, recommendations: recs.slice(0, 3) };
}
