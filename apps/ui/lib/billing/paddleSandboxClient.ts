import type { SandboxCatalog } from "./sandboxCatalog";

type Item = { priceId: string; quantity: 1 };
type PaddleTotals = { subtotal?: number; tax?: number; total?: number; discount?: number; credit?: number; balance?: number };
type CheckoutEvent = {
  name?: string;
  data?: {
    transaction_id?: string;
    status?: string;
    currency_code?: string;
    totals?: PaddleTotals;
    recurring_totals?: PaddleTotals;
  };
};
type CheckoutTheme = "dark" | "light";
type Paddle = {
  Environment: { set(value: "sandbox"): void };
  Initialize(options: { token: string; eventCallback: (event: CheckoutEvent) => void }): void;
  PricePreview(options: { items: Item[] }): Promise<{
    data: { details: { lineItems: Array<{ price: { id: string }; formattedTotals: { total: string } }> } };
  }>;
  Checkout: {
    open(options: { transactionId: string; settings: {
      displayMode: "inline"; variant: "one-page"; theme: CheckoutTheme;
      frameTarget: string; frameInitialHeight: string; frameStyle: string;
    } }): void;
    close(): void;
  };
};

export type SandboxCheckoutSummary = {
  currency: string;
  subtotal: number;
  tax: number;
  due: number;
  renewal: number;
  discount: number;
  credit: number;
};

type InlineCheckout = {
  frameTarget: string;
  theme: CheckoutTheme;
  onSummary: (summary: SandboxCheckoutSummary) => void;
  onPhase: (phase: "selectable" | "pending" | "completed") => void;
  onClose: (abandoned: boolean) => void;
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

function readSummary(data: CheckoutEvent["data"]): SandboxCheckoutSummary | null {
  const currency = data?.currency_code;
  const totals = data?.totals;
  const recurring = data?.recurring_totals;
  const { subtotal, tax, total, balance, discount, credit } = totals ?? {};
  const renewal = recurring?.total;
  if (
    typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency) ||
    typeof subtotal !== "number" || !Number.isFinite(subtotal) ||
    typeof tax !== "number" || !Number.isFinite(tax) ||
    typeof total !== "number" || !Number.isFinite(total) ||
    typeof renewal !== "number" || !Number.isFinite(renewal)
  ) return null;
  return {
    currency, subtotal, tax, renewal,
    due: typeof balance === "number" && Number.isFinite(balance) ? balance : total,
    discount: typeof discount === "number" && Number.isFinite(discount) ? discount : 0,
    credit: typeof credit === "number" && Number.isFinite(credit) ? credit : 0,
  };
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
    open(transactionId: string, options: InlineCheckout) {
      let paymentMayComplete = false;
      let paymentCompleted = false;
      let open = true;
      const detach = () => {
        checkoutListeners.delete(transactionId);
        open = false;
      };
      checkoutListeners.set(transactionId, event => {
        if (event.name === "checkout.payment.initiated") paymentMayComplete = true;
        if (event.name === "checkout.payment.failed" || event.name === "checkout.payment.dismissed") paymentMayComplete = false;
        if (event.name === "checkout.completed") paymentCompleted = true;
        options.onPhase(paymentCompleted ? "completed" : paymentMayComplete ? "pending" : "selectable");
        const summary = readSummary(event.data);
        if (summary) options.onSummary(summary);
        if (event.name === "checkout.closed") {
          detach();
          const status = event.data?.status;
          options.onClose(!paymentMayComplete && !paymentCompleted && (status === "draft" || status === "ready"));
        }
      });
      try {
        paddle.Checkout.open({
          transactionId,
          settings: {
            displayMode: "inline",
            variant: "one-page",
            frameTarget: options.frameTarget,
            frameInitialHeight: "450",
            frameStyle: "width: 100%; min-width: 312px; background-color: transparent; border: 0;",
            theme: options.theme,
          },
        });
      } catch (error) {
        detach();
        throw error;
      }
      return {
        closeIfUnpaid() {
          if (!open || paymentMayComplete || paymentCompleted) return;
          detach();
          try {
            paddle.Checkout.close();
          } finally {
            options.onClose(true);
          }
        },
        dispose() {
          if (!open) return;
          detach();
          paddle.Checkout.close();
        },
      };
    },
  };
}
