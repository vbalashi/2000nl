import { randomUUID } from "node:crypto";

type RouteTimingEntry = {
  name: string;
  durationMs: number;
};

export type PlatformRouteInstrumentation = {
  requestId: string;
  startedAt: number;
  entries: RouteTimingEntry[];
};

export function createPlatformRouteInstrumentation(request: Request) {
  const incomingRequestId = request.headers.get("x-request-id")?.trim();
  return {
    requestId: incomingRequestId || randomUUID(),
    startedAt: performance.now(),
    entries: [],
  };
}

export async function measureRouteTiming<T>(
  instrumentation: PlatformRouteInstrumentation,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    instrumentation.entries.push({
      name,
      durationMs: performance.now() - startedAt,
    });
  }
}

export function appendPlatformRouteHeaders(
  response: Response,
  instrumentation: PlatformRouteInstrumentation,
  operationServerTiming?: string,
) {
  instrumentation.entries.push({
    name: "route.total",
    durationMs: performance.now() - instrumentation.startedAt,
  });

  const routeTiming = instrumentation.entries
    .map((entry) => `${entry.name};dur=${Math.max(0, entry.durationMs).toFixed(1)}`)
    .join(", ");
  const serverTiming = [routeTiming, operationServerTiming].filter(Boolean).join(", ");
  if (serverTiming) {
    response.headers.set("Server-Timing", serverTiming);
  }
  response.headers.set("X-Request-Id", instrumentation.requestId);
  return response;
}
