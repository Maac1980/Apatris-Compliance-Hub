/**
 * AI Rate Limiter — prevents runaway costs from Claude/Perplexity calls.
 *
 * Per-tenant limits:
 *  - 50 AI calls per hour (copilot, explanation, OCR, rejection)
 *  - 10 Perplexity calls per hour
 *
 * Stored in memory (resets on deploy). Simple and sufficient for internal use.
 */

interface BucketEntry { count: number; resetAt: number; }

const buckets = new Map<string, BucketEntry>();

const LIMITS: Record<string, { maxPerHour: number }> = {
  claude: { maxPerHour: 50 },
  perplexity: { maxPerHour: 10 },
};

export function checkAIRateLimit(tenantId: string, provider: "claude" | "perplexity"): { allowed: boolean; remaining: number; resetsIn: number } {
  const key = `${tenantId}:${provider}`;
  const limit = LIMITS[provider];
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 3_600_000 }; // 1 hour window
    buckets.set(key, bucket);
  }

  const remaining = Math.max(0, limit.maxPerHour - bucket.count);
  const resetsIn = Math.ceil((bucket.resetAt - now) / 1000);

  if (bucket.count >= limit.maxPerHour) {
    return { allowed: false, remaining: 0, resetsIn };
  }

  bucket.count++;
  return { allowed: true, remaining: remaining - 1, resetsIn };
}

export function getAIUsage(tenantId: string): Record<string, { used: number; limit: number; resetsIn: number }> {
  const now = Date.now();
  const result: Record<string, { used: number; limit: number; resetsIn: number }> = {};

  for (const [provider, config] of Object.entries(LIMITS)) {
    const key = `${tenantId}:${provider}`;
    const bucket = buckets.get(key);
    result[provider] = {
      used: bucket && now < bucket.resetAt ? bucket.count : 0,
      limit: config.maxPerHour,
      resetsIn: bucket && now < bucket.resetAt ? Math.ceil((bucket.resetAt - now) / 1000) : 0,
    };
  }

  return result;
}
