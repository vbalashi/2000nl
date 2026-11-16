import { vi } from "vitest";
/** Fake only the server coordinator boundary. SQL tests exercise real atomicity/admission. */
export function providerWorkFixture() {
  const rows = new Map<string, { token: string; status: string; result?: unknown }>();
  let sequence = 0;
  const rpc = vi.fn((name: string, args: Record<string, any>) => {
    const key = `${args.p_kind}:${args.p_identity}`, row = rows.get(key);
    let data: unknown;
    if (name === "read_provider_work_v1") data = row?.status === "ready" ? row.result : null;
    else if (name === "begin_provider_work_v1") {
      if (row?.status === "ready") data = { status: "ready", result: row.result };
      else if (row?.status === "pending") data = { status: "pending", retryAfterMs: 1000 };
      else { const token = `lease-${++sequence}`; rows.set(key, { token, status: "pending" }); data = { status: "claimed", leaseToken: token }; }
    } else if (name === "finish_provider_work_v1") {
      data = row?.status === "pending" && row.token === args.p_lease_token;
      if (data) rows.set(key, { token: row!.token, status: args.p_result ? "ready" : "failed", result: args.p_result });
    } else throw new Error(`unexpected_rpc:${name}`);
    return { abortSignal: () => Promise.resolve({ data, error: null }) };
  });
  return { rpc, rows, reset: () => { rows.clear(); rpc.mockClear(); } };
}
