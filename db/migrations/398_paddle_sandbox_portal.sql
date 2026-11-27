-- Keep subscription ownership anchored to a signed payment and the authenticated checkout account.
BEGIN;

CREATE OR REPLACE FUNCTION public.read_paddle_sandbox_access()
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
    SELECT owned.plan, owned.subscription_id,
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
    SELECT jsonb_build_object('active', true, 'plan', plan, 'validUntil', ends_at, 'endsAfterCancel', ends_after_cancel, 'subscriptionId', subscription_id)
    FROM periods WHERE starts_at <= statement_timestamp() AND ends_at > statement_timestamp()
      AND starts_at IS NOT NULL
    ORDER BY ends_at DESC, plan, subscription_id LIMIT 1
  ), jsonb_strip_nulls(jsonb_build_object('active', false, 'subscriptionId', (
    SELECT subscription_id FROM owned
    JOIN private.paddle_sandbox_attempts attempt USING (transaction_id)
    ORDER BY attempt.created_at DESC, owned.subscription_id LIMIT 1
  ))));
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
