export type PlatformTimingEntry = {
  name: string;
  durationMs: number;
};

export function formatPlatformServerTiming(entries: PlatformTimingEntry[]) {
  return entries
    .map((entry) => `${entry.name};dur=${Math.max(0, entry.durationMs).toFixed(1)}`)
    .join(", ");
}

export async function measurePlatformTiming<T>(
  timings: PlatformTimingEntry[],
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    timings.push({ name, durationMs: performance.now() - startedAt });
  }
}

export async function rpcWithPlatformLookupTiming(
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => any;
  },
  name: string,
  args: Record<string, unknown>,
  scope: "authenticated" | "catalog",
) {
  const startedAt = Date.now();
  const result = await supabase.rpc(name, args);
  if (process.env.PLATFORM_LOOKUP_LATENCY_LOGS === "1") {
    console.info("[platform.lookup]", {
      scope,
      rpc: name,
      elapsedMs: Date.now() - startedAt,
      ok: !result?.error,
    });
  }
  return result;
}
