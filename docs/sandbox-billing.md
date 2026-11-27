# Paddle Sandbox billing

The Sandbox checkout can project verified payments into a test-only Premium entitlement. It currently exposes this state in **Settings → Billing & subscriptions** and uses it to exercise the server gate for the personal card assistant. Existing manual tiers are independent. The runtime supports test billing in staging. Live billing requires a separate rollout.

To qualify a test instance:

1. Apply `db/migrations/397_paddle_sandbox_billing.sql` to a disposable database with the application roles and Auth schema. Run `db/sandbox/paddle-billing.test.sql` on the same instance. The latter rolls back its own test data.
2. Configure the Sandbox catalog and transaction credentials, `DEPLOYMENT_ENV=staging`, `PADDLE_SANDBOX_FULFILLMENT_ENABLED=true` and a Sandbox notification signature secret. The live deployment environment rejects Sandbox webhook requests.
3. Set the notification URL to `/api/billing/sandbox/webhook` on the isolated instance. Subscribe to `transaction.completed`, `subscription.created`, `subscription.updated`, `subscription.canceled`, `adjustment.created`, and `adjustment.updated`. Find the exact checkout account and price IDs in its server configuration.
4. Create a new checkout through the server after enabling notifications. Checkouts created earlier have no durable account binding and cannot grant this entitlement. Use a synthetic buyer and the provider's test card.

For an isolated simulation run, enable `PADDLE_SANDBOX_SIMULATIONS_ENABLED=true` and use a destination that accepts simulation traffic. Keep the switch off on a persistent environment.

A completed matching transaction activates its paid period. A renewal extends access only for another completed recurring transaction. A scheduled cancellation preserves paid access up to its effective time. An effective cancellation or full approved refund removes the applicable paid access. Pending refunds leave access as is. Approved refunds revoke the applicable period when their distinct, same-currency amounts cover the original payment. This accounts for Paddle representing full line-item refunds as partial adjustments. A refund for an older payment preserves any other currently valid paid period. Dates are evaluated at read time, including expiry without a later event. Duplicate deliveries and delayed active updates cannot re-apply a refunded payment or remove a terminal cancellation.

The server verifies the signature on the original body and stores a bounded set of normalized facts with event identity. It does not persist raw payloads or card details. The access RPC derives the account from the authenticated session. The browser's checkout success screen is never an entitlement grant. Disabling new checkout keeps webhook intake and entitlement reads active. Managed live rollback still requires separate qualification.

See [Paddle signatures](https://developer.paddle.com/webhooks/signature-verification/), [renewal events](https://developer.paddle.com/webhooks/simulator/subscription-renewed/), and [refund approval events](https://developer.paddle.com/webhooks/adjustments/adjustment-updated/).

In Settings → Billing & subscriptions, the configured Paddle customer portal lets customers open their billing history, update their payment method, and cancel. Pass the account’s public Sandbox portal URL as `PADDLE_SANDBOX_CUSTOMER_PORTAL_URL`. Buyers sign in using the email from checkout.
