const RATE_LIMIT_WINDOW_MS=60_000;
const RATE_LIMIT_MAX_REQUESTS=20;
type RateBucket = {
  count: number;
  resetAt: number;
};

const audioResolveRateBuckets = new Map<string, RateBucket>();

export function consumeAudioRateLimit(key: string, maximum = RATE_LIMIT_MAX_REQUESTS) {
  const now = Date.now();
  const bucket = audioResolveRateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    audioResolveRateBuckets.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (bucket.count >= maximum) {
    return { allowed: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
