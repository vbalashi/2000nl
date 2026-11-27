import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedUserSupabase: auth,
  getPlatformServiceSupabase: () => ({ supabase: { auth: { admin: { updateUserById: update } } } }),
  jsonNoStore: (payload: unknown, status = 200) => Response.json(payload, { status }),
}));

import { POST } from "@/app/api/legal/acceptance/route";
import { serviceTermsVersion } from "@/lib/legal/serviceTerms";

function request(version = serviceTermsVersion) {
  return new Request("http://localhost/api/legal/acceptance", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version }),
  });
}

beforeEach(() => {
  vi.stubEnv("DILUM_SERVICE_TERMS_DIR", "/managed/legal");
  vi.stubEnv("DEPLOYMENT_ENV", "staging");
  auth.mockReset().mockResolvedValue({ user: { id: "learner", app_metadata: {} } });
  update.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("service terms acceptance", () => {
  it("writes the displayed version and server time for the authenticated learner", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(update).toHaveBeenCalledWith("learner", { app_metadata: {
      dilum_terms_version: serviceTermsVersion, dilum_terms_accepted_at: expect.any(String),
    } });
  });
  it("keeps the original receipt on a retry after successful acceptance", async () => {
    auth.mockResolvedValue({ user: { id: "learner", app_metadata: { dilum_terms_version: serviceTermsVersion } } });
    expect((await POST(request())).status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
  it("rejects stale versions, unauthenticated requests and deployments without managed terms", async () => {
    expect((await POST(request("old"))).status).toBe(409);
    auth.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await POST(request())).status).toBe(401);
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    expect((await POST(request())).status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
  it("returns an error when the account update fails", async () => {
    update.mockResolvedValue({ error: new Error("temporarily unavailable") });
    expect((await POST(request())).status).toBe(503);
  });
});
