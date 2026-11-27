-- Sandbox qualification only. Apply to an isolated application database.
-- Managed adoption and live billing require a separately qualified migration.
BEGIN;

CREATE TABLE private.paddle_sandbox_attempts (
  transaction_id text PRIMARY KEY CHECK (transaction_id ~ '^txn_[a-z0-9]{26}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_id text NOT NULL CHECK (price_id ~ '^pri_[a-z0-9]{26}$'),
  plan text NOT NULL CHECK (plan IN ('month', 'year')),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE INDEX paddle_sandbox_attempts_user ON private.paddle_sandbox_attempts(user_id);

-- Store only normalized, content-free facts. Their projection is independent of delivery order.
CREATE TABLE private.paddle_sandbox_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^(evt|ntfsimevt)_[a-z0-9]{26}$'),
  kind text NOT NULL CHECK (kind IN ('payment', 'created', 'subscription', 'refund')),
  occurred_at timestamptz NOT NULL,
  transaction_id text CHECK (transaction_id ~ '^txn_[a-z0-9]{26}$'),
  subscription_id text CHECK (subscription_id ~ '^sub_[a-z0-9]{26}$'),
  price_id text CHECK (price_id ~ '^pri_[a-z0-9]{26}$'),
  valid_from timestamptz,
  valid_until timestamptz,
  cancel_at timestamptz,
  terminal boolean NOT NULL DEFAULT false,
  renewal boolean NOT NULL DEFAULT false,
  adjustment_id text CHECK (adjustment_id ~ '^adj_[a-z0-9]{26}$'),
  amount bigint CHECK (amount > 0),
  currency text CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK ((valid_from IS NULL AND valid_until IS NULL) OR
    (valid_from IS NOT NULL AND valid_until IS NOT NULL AND valid_from < valid_until)),
  CHECK (
    (kind = 'payment' AND transaction_id IS NOT NULL AND subscription_id IS NOT NULL AND price_id IS NOT NULL
      AND amount IS NOT NULL AND currency IS NOT NULL) OR
    (kind = 'created' AND transaction_id IS NOT NULL AND subscription_id IS NOT NULL AND price_id IS NOT NULL AND valid_until IS NOT NULL) OR
    (kind = 'subscription' AND subscription_id IS NOT NULL AND (NOT terminal OR cancel_at IS NOT NULL)) OR
    (kind = 'refund' AND transaction_id IS NOT NULL AND adjustment_id IS NOT NULL AND amount IS NOT NULL AND currency IS NOT NULL)
  )
);
CREATE INDEX paddle_sandbox_events_txn ON private.paddle_sandbox_events(transaction_id, kind);
CREATE INDEX paddle_sandbox_events_subscription ON private.paddle_sandbox_events(subscription_id, kind, occurred_at DESC);
ALTER TABLE private.paddle_sandbox_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.paddle_sandbox_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.paddle_sandbox_attempts, private.paddle_sandbox_events FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.register_paddle_sandbox_attempt(p_transaction text, p_user uuid, p_price text, p_plan text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  INSERT INTO private.paddle_sandbox_attempts(transaction_id, user_id, price_id, plan)
  VALUES (p_transaction, p_user, p_price, p_plan);
$$;
REVOKE ALL ON FUNCTION public.register_paddle_sandbox_attempt(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_paddle_sandbox_attempt(text, uuid, text, text) TO service_role;

CREATE FUNCTION public.record_paddle_sandbox_event(p_event jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  INSERT INTO private.paddle_sandbox_events
    (event_id, kind, occurred_at, transaction_id, subscription_id, price_id, valid_from, valid_until, cancel_at, terminal, renewal, adjustment_id, amount, currency)
  VALUES (
    p_event->>'eventId', p_event->>'kind', (p_event->>'occurredAt')::timestamptz,
    p_event->>'transactionId', p_event->>'subscriptionId', p_event->>'priceId',
    (p_event->>'validFrom')::timestamptz, (p_event->>'validUntil')::timestamptz,
    (p_event->>'cancelAt')::timestamptz, coalesce((p_event->>'terminal')::boolean, false),
    coalesce((p_event->>'renewal')::boolean, false),
    p_event->>'adjustmentId', (p_event->>'amount')::bigint, p_event->>'currency'
  )
  ON CONFLICT (event_id) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.record_paddle_sandbox_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paddle_sandbox_event(jsonb) TO service_role;

CREATE FUNCTION public.read_paddle_sandbox_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH owned AS (
    SELECT DISTINCT ON (paid.subscription_id)
      paid.subscription_id, paid.transaction_id, attempt.price_id, attempt.plan
    FROM private.paddle_sandbox_attempts attempt
    JOIN private.paddle_sandbox_events paid
      ON paid.transaction_id = attempt.transaction_id AND paid.kind = 'payment'
      AND paid.price_id = attempt.price_id AND NOT paid.renewal
    WHERE attempt.user_id = (SELECT auth.uid())
    ORDER BY paid.subscription_id, paid.occurred_at, paid.event_id
  ), periods AS (
    SELECT owned.plan,
      coalesce(paid.valid_from, first_period.valid_from) AS starts_at,
      least(coalesce(paid.valid_until, first_period.valid_until), terminal.cancel_at, state.cancel_at) AS ends_at,
      terminal.cancel_at IS NOT NULL OR state.cancel_at IS NOT NULL AS ends_after_cancel
    FROM owned
    JOIN private.paddle_sandbox_events paid ON paid.subscription_id = owned.subscription_id
      AND paid.kind = 'payment' AND paid.price_id = owned.price_id
      AND (paid.transaction_id = owned.transaction_id OR paid.renewal)
    LEFT JOIN LATERAL (
      SELECT e.valid_from, e.valid_until FROM private.paddle_sandbox_events e
      WHERE e.kind = 'created' AND e.subscription_id = owned.subscription_id
        AND e.transaction_id = owned.transaction_id AND e.transaction_id = paid.transaction_id
        AND e.price_id = owned.price_id
      ORDER BY e.occurred_at, e.event_id LIMIT 1
    ) first_period ON paid.valid_until IS NULL
    LEFT JOIN LATERAL (
      SELECT min(e.cancel_at) AS cancel_at FROM private.paddle_sandbox_events e
      WHERE e.kind = 'subscription' AND e.subscription_id = owned.subscription_id AND e.terminal
    ) terminal ON true
    LEFT JOIN LATERAL (
      SELECT e.cancel_at FROM private.paddle_sandbox_events e
      WHERE e.kind = 'subscription' AND e.subscription_id = owned.subscription_id AND NOT e.terminal
      ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1
    ) state ON true
    WHERE coalesce((
      SELECT sum(refund.amount)
      FROM (
        SELECT DISTINCT ON (e.adjustment_id) e.amount
        FROM private.paddle_sandbox_events e
        WHERE e.kind = 'refund' AND e.transaction_id = paid.transaction_id AND e.currency = paid.currency
        ORDER BY e.adjustment_id, e.occurred_at DESC, e.event_id DESC
      ) refund
    ), 0) < paid.amount
  )
  SELECT coalesce((
    SELECT jsonb_build_object('active', true, 'plan', plan, 'validUntil', ends_at, 'endsAfterCancel', ends_after_cancel)
    FROM periods WHERE starts_at <= statement_timestamp() AND ends_at > statement_timestamp()
      AND starts_at IS NOT NULL
    ORDER BY ends_at DESC, plan LIMIT 1
  ), '{"active":false}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.read_paddle_sandbox_access() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_paddle_sandbox_access() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
