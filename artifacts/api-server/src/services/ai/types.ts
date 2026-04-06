/**
 * AI Types — shared interfaces for the AI service layer.
 *
 * AI assists, explains, classifies, summarizes.
 * Core payroll/compliance logic remains deterministic.
 */

export interface AICompletionRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
}

export interface AICompletionResponse {
  text: string;
  model: string;
  tokensUsed?: number;
}

export interface AIProvider {
  name: string;
  isAvailable(): boolean;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

// Use-case input/output types

export interface ComplianceSummaryInput {
  score: number;
  riskLevel: string;
  expiredCount: number;
  criticalCount: number;
  warningCount: number;
  missingCount: number;
  topRisks: string[];
  totalWorkers: number;
}

export interface ComplianceSummaryOutput {
  summary: string;
  recommendations: string[];
  aiGenerated: boolean;
}
