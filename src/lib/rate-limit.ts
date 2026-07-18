/**
 * In-memory sliding-window rate limiter (per-process).
 * For multi-instance deploys, front with CDN/WAF; this still protects the app process.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  let b = buckets.get(opts.key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(opts.key, b);
  }
  b.count += 1;
  const remaining = Math.max(0, opts.limit - b.count);
  if (b.count > opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: b.resetAt - now };
  }
  return { ok: true, remaining, retryAfterMs: 0 };
}

/** Periodic cleanup to avoid unbounded growth */
export function pruneRateLimitBuckets() {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}
