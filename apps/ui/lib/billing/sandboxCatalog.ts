export type SandboxCatalog = {
  clientToken: string;
  prices: { month: string; year: string };
};

export function readSandboxCatalog(env: Readonly<Record<string, string | undefined>>): SandboxCatalog | null {
  const clientToken = env.PADDLE_SANDBOX_CLIENT_TOKEN;
  const month = env.PADDLE_SANDBOX_MONTHLY_PRICE_ID;
  const year = env.PADDLE_SANDBOX_YEARLY_PRICE_ID;
  const priceId = /^pri_[a-z0-9]{26}$/;
  if (env.PADDLE_SANDBOX_CHECKOUT_ENABLED !== "true" ||
    !clientToken || !/^test_[a-zA-Z0-9]+$/.test(clientToken) ||
    !month || !year || month === year || !priceId.test(month) || !priceId.test(year)) {
    return null;
  }
  return { clientToken, prices: { month, year } };
}
