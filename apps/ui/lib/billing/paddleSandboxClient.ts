import type { SandboxCatalog } from "./sandboxCatalog";

type Item = { priceId: string; quantity: 1 };
type CheckoutEvent = { name?: string; data?: { transaction_id?: string; status?: string } };
type Paddle = {
  Environment: { set(value: "sandbox"): void };
  Initialize(options: { token: string; eventCallback: (event: CheckoutEvent) => void }): void;
  PricePreview(options: { items: Item[] }): Promise<{
    data: { details: { lineItems: Array<{ price: { id: string }; formattedTotals: { total: string } }> } };
  }>;
  Checkout: { open(options: { transactionId: string }): void };
};

let pending: Promise<Paddle> | undefined;
const checkoutListeners = new Map<string, (event: CheckoutEvent) => void>();

function dispatchCheckoutEvent(event: CheckoutEvent) {
  const transactionId = event.data?.transaction_id;
  if (transactionId) checkoutListeners.get(transactionId)?.(event);
}

function loadSandbox(token: string): Promise<Paddle> {
  pending ??= new Promise<Paddle>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      }
    };
    const timeout = window.setTimeout(() => finish(new Error("paddle_timeout")), 15000);
    script.onerror = () => finish(new Error("paddle_unavailable"));
    script.onload = () => {
      try {
        const paddle = (window as Window & { Paddle?: Paddle }).Paddle;
        if (!paddle) throw new Error("paddle_unavailable");
        paddle.Environment.set("sandbox");
        paddle.Initialize({ token, eventCallback: dispatchCheckoutEvent });
        finish();
        resolve(paddle);
      } catch {
        finish(new Error("paddle_unavailable"));
      }
    };
    document.head.append(script);
  }).catch(error => {
    pending = undefined;
    throw error;
  });
  return pending;
}

export async function prepareSandboxOffer(catalog: SandboxCatalog) {
  const paddle = await loadSandbox(catalog.clientToken);
  const item = (plan: keyof SandboxCatalog["prices"]): Item => ({ priceId: catalog.prices[plan], quantity: 1 });
  const response = await paddle.PricePreview({ items: [item("month"), item("year")] });
  const lines = response.data.details.lineItems;
  const amount = (id: string) => lines.find(line => line.price.id === id)?.formattedTotals.total;
  const month = amount(catalog.prices.month);
  const year = amount(catalog.prices.year);
  if (!month || !year) throw new Error("incomplete_price_preview");
  return {
    amounts: { month, year },
    open(transactionId: string, onAbandon: () => void) {
      let paymentMayComplete = false;
      let paymentCompleted = false;
      const dispose = () => checkoutListeners.delete(transactionId);
      checkoutListeners.set(transactionId, event => {
        if (event.name === "checkout.payment.initiated") paymentMayComplete = true;
        if (event.name === "checkout.payment.failed") paymentMayComplete = false;
        if (event.name === "checkout.completed") paymentCompleted = true;
        if (event.name === "checkout.closed") {
          dispose();
          const status = event.data?.status;
          if (!paymentMayComplete && !paymentCompleted && (status === "draft" || status === "ready")) onAbandon();
        }
      });
      try {
        paddle.Checkout.open({ transactionId });
      } catch (error) {
        dispose();
        throw error;
      }
      return dispose;
    },
  };
}
