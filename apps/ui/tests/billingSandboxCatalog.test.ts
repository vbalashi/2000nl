import { describe, expect, it } from "vitest";
import { readSandboxCatalog } from "@/lib/billing/sandboxCatalog";

const month = "pri_" + "a".repeat(26);
const year = "pri_" + "b".repeat(26);
const env = {
  PADDLE_SANDBOX_CHECKOUT_ENABLED: "true",
  PADDLE_SANDBOX_CLIENT_TOKEN: "test_sample",
  PADDLE_SANDBOX_MONTHLY_PRICE_ID: month,
  PADDLE_SANDBOX_YEARLY_PRICE_ID: year,
};

describe("sandbox checkout configuration", () => {
  it("exposes only the test client token and two distinct test prices", () => {
    expect(readSandboxCatalog({ ...env, PADDLE_API_KEY: "server-only" })).toEqual({
      clientToken: "test_sample",
      prices: { month, year },
    });
  });

  it.each([
    { PADDLE_SANDBOX_CHECKOUT_ENABLED: "false" },
    { PADDLE_SANDBOX_CLIENT_TOKEN: "live_sample" },
    { PADDLE_SANDBOX_CLIENT_TOKEN: "pdl_sdbx_apikey_sample" },
    { PADDLE_SANDBOX_YEARLY_PRICE_ID: month },
    { PADDLE_SANDBOX_YEARLY_PRICE_ID: "" },
  ])("fails closed for %o", (overrides) => {
    expect(readSandboxCatalog({ ...env, ...overrides })).toBeNull();
  });
});
