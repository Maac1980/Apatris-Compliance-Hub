import { logger } from './logger.js'

let anthropic: any = null;
import('@anthropic-ai/sdk').then(m => {
  anthropic = new m.default({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
}).catch(() => { logger.warn('[AI] @anthropic-ai/sdk not available'); });

export type RiskLevel = 'RED' | 'AMBER' | 'GREEN'

export interface WorkerRiskScore {
  workerId: string
  workerName: string
  riskLevel: RiskLevel
  score: number
  reasons: string[]
  recommendations: string[]
  expiringDocuments: ExpiringDoc[]
  analysedAt: string
}

export interface ExpiringDoc {
  document: string
  expiryDate: string
  daysRemaining: number
  severity: RiskLevel
}

function getDaysRemaining(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  const today = new Date()
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function classifyExpiry(days: number | null): RiskLevel {
  if (days === null || days < 0) return 'RED'
  if (days <= 30) return 'RED'
  if (days <= 60) return 'AMBER'
  return 'GREEN'
}

export function calculateBasicRisk(worker: any): ExpiringDoc[] {
  const documents = [
    { key: 'weldingCertExpiry', label: 'Welding Certification (EN ISO 9606)' },
    { key: 'medicalExamExpiry', label: 'Medical Examination' },
    { key: 'visaExpiry', label: 'Visa / Work Permit' },
    { key: 'safetyTrainingExpiry', label: 'Safety Training Certificate' },
    { key: 'contractEndDate', label: 'Contract End Date' },
    { key: 'liftingCertExpiry', label: 'Lifting Equipment Certificate' },
  ]

  return documents
    .map(doc => {
      const days = getDaysRemaining(worker[doc.key])
      const severity = classifyExpiry(days)
      return { document: doc.label, expiryDate: worker[doc.key] ?? 'Not provided', daysRemaining: days ?? -999, severity }
    })
    .filter(d => d.severity !== 'GREEN')
}

export async function scoreWorkerRisk(worker: any): Promise<WorkerRiskScore> {
  const expiringDocuments = calculateBasicRisk(worker)
  const redCount = expiringDocuments.filter(d => d.severity === 'RED').length
  const amberCount = expiringDocuments.filter(d => d.severity === 'AMBER').length
  const baseScore = Math.min(100, redCount * 30 + amberCount * 15)
  const baseRisk: RiskLevel = redCount > 0 ? 'RED' : amberCount > 0 ? 'AMBER' : 'GREEN'

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'You are a welding compliance expert. Respond in JSON format.',
        messages: [{ role: 'user', content: `Analyse this worker's compliance status.
Worker: ${worker.name ?? 'Unknown'}, Role: ${worker.specialization ?? 'Welder'}
Expiring Documents: ${JSON.stringify(expiringDocuments)}
Respond in JSON: { "score": 0-100, "riskLevel": "RED|AMBER|GREEN", "reasons": [], "recommendations": [] }` }],
      })
      const aiText = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
      const aiResult = JSON.parse(aiText)
      return { workerId: worker.id ?? 'unknown', workerName: worker.name ?? 'Unknown', riskLevel: aiResult.riskLevel ?? baseRisk, score: aiResult.score ?? baseScore, reasons: aiResult.reasons ?? [], recommendations: aiResult.recommendations ?? [], expiringDocuments, analysedAt: new Date().toISOString() }
    } catch (err) {
      logger.warn({ err }, 'Claude AI failed, using basic scoring')
    }
  }

  return {
    workerId: worker.id ?? 'unknown',
    workerName: worker.name ?? 'Unknown',
    riskLevel: baseRisk,
    score: baseScore,
    reasons: expiringDocuments.map(d => d.daysRemaining < 0 ? `${d.document} expired ${Math.abs(d.daysRemaining)} days ago` : `${d.document} expires in ${d.daysRemaining} days`),
    recommendations: expiringDocuments.map(d => `Renew ${d.document} immediately`),
    expiringDocuments,
    analysedAt: new Date().toISOString(),
  }
}

export async function scoreAllWorkers(workers: any[]) {
  const scores = await Promise.all(workers.map(w => scoreWorkerRisk(w)))
  scores.sort((a, b) => b.score - a.score)
  return {
    summary: { red: scores.filter(s => s.riskLevel === 'RED').length, amber: scores.filter(s => s.riskLevel === 'AMBER').length, green: scores.filter(s => s.riskLevel === 'GREEN').length, total: scores.length },
    workers: scores,
  }
}
