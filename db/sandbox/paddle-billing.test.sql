-- Run against a disposable database with paddle-billing.sql installed.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000101'), ('00000000-0000-4000-8000-000000000102');
CREATE FUNCTION pg_temp.assert_access(owner_id uuid, expected boolean, reason text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  IF public.read_paddle_sandbox_access()->'active' IS DISTINCT FROM to_jsonb(expected) THEN
    RAISE EXCEPTION 'Unexpected access: %', reason;
  END IF;
END;
$$;
DO $$
DECLARE
  owner_id constant uuid := '00000000-0000-4000-8000-000000000101';
  outsider constant uuid := '00000000-0000-4000-8000-000000000102';
  price constant text := 'pri_'||repeat('p',26);
  subid constant text := 'sub_'||repeat('s',26);
  first_txn constant text := 'txn_'||repeat('a',26);
  renewal_txn constant text := 'txn_'||repeat('b',26);
  now_at constant timestamptz := statement_timestamp();
  first_payment jsonb;
  renewal jsonb;
  state_event jsonb;
BEGIN
  PERFORM pg_temp.assert_access(owner_id,false,'initial free account');
  first_payment := jsonb_build_object('eventId','evt_'||repeat('a',26),'kind','payment',
    'occurredAt',now_at - interval '2 hours','transactionId',first_txn,'subscriptionId',subid,'priceId',price,'amount',600,'currency','EUR');
  PERFORM public.record_paddle_sandbox_event(first_payment);
  PERFORM public.record_paddle_sandbox_event(jsonb_build_object('eventId','evt_'||repeat('c',26),'kind','created',
    'occurredAt',now_at - interval '2 hours','transactionId',first_txn,'subscriptionId',subid,'priceId',price,
    'validFrom',now_at - interval '2 hours','validUntil',now_at + interval '2 days'));
  PERFORM pg_temp.assert_access(owner_id,false,'unowned third-party purchase');
  PERFORM public.register_paddle_sandbox_attempt(first_txn,owner_id,price,'month');
  PERFORM pg_temp.assert_access(owner_id,true,'initial payment confirmed');
  PERFORM pg_temp.assert_access(outsider,false,'another account cannot receive access');
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  IF (public.read_paddle_sandbox_access()->>'validUntil')::timestamptz <> now_at + interval '2 days' THEN
    RAISE EXCEPTION 'Incorrect first paid period';
  END IF;

  state_event := jsonb_build_object('eventId','evt_'||repeat('d',26),'kind','subscription',
    'occurredAt',now_at - interval '15 minutes','subscriptionId',subid);
  PERFORM public.record_paddle_sandbox_event(state_event);
  IF (public.read_paddle_sandbox_access()->>'validUntil')::timestamptz <> now_at + interval '2 days' THEN
    RAISE EXCEPTION 'Unpaid subscription updates must not extend access';
  END IF;
  renewal := jsonb_build_object('eventId','evt_'||repeat('b',26),'kind','payment',
    'occurredAt',now_at - interval '10 minutes','transactionId',renewal_txn,'subscriptionId',subid,
    'priceId',price,'amount',600,'currency','EUR','renewal',true,'validFrom',now_at - interval '10 minutes','validUntil',now_at + interval '30 days');
  PERFORM public.record_paddle_sandbox_event(renewal);
  PERFORM public.record_paddle_sandbox_event(renewal);
  IF (public.read_paddle_sandbox_access()->>'validUntil')::timestamptz <> now_at + interval '30 days' THEN
    RAISE EXCEPTION 'Confirmed renewal must extend access exactly once';
  END IF;
  PERFORM public.record_paddle_sandbox_event(jsonb_build_object('eventId','evt_'||repeat('e',26),'kind','subscription',
    'occurredAt',now_at - interval '5 minutes','subscriptionId',subid,'cancelAt',now_at + interval '30 days'));
  PERFORM pg_temp.assert_access(owner_id,true,'scheduled cancellation preserves paid access');
  IF public.read_paddle_sandbox_access()->'endsAfterCancel' <> 'true'::jsonb THEN
    RAISE EXCEPTION 'Scheduled cancellation not shown';
  END IF;
  PERFORM public.record_paddle_sandbox_event(jsonb_build_object('eventId','evt_'||repeat('f',26),'kind','refund',
    'occurredAt',now_at - interval '3 minutes','transactionId',first_txn,'adjustmentId','adj_'||repeat('a',26),'amount',600,'currency','EUR'));
  PERFORM pg_temp.assert_access(owner_id,true,'old refund preserves independently paid period');
  PERFORM public.record_paddle_sandbox_event(jsonb_build_object('eventId','evt_'||repeat('k',26),'kind','refund',
    'occurredAt',now_at - interval '2 minutes','transactionId',renewal_txn,
    'adjustmentId','adj_'||repeat('b',26),'amount',300,'currency','EUR'));
  PERFORM public.record_paddle_sandbox_event(jsonb_build_object('eventId','evt_'||repeat('l',26),'kind','refund',
    'occurredAt',now_at - interval '2 minutes','transactionId',renewal_txn,
    'adjustmentId','adj_'||repeat('b',26),'amount',300,'currency','EUR'));
  PERFORM pg_temp.assert_access(owner_id,true,'duplicate notification for a partial refund does not revoke access');
  PERFORM public.record_paddle_sandbox_event(jsonb_build_object('eventId','evt_'||repeat('g',26),'kind','refund',
    'occurredAt',now_at - interval '2 minutes','transactionId',renewal_txn,
    'adjustmentId','adj_'||repeat('c',26),'amount',300,'currency','EUR'));
  PERFORM public.record_paddle_sandbox_event(renewal);
  PERFORM pg_temp.assert_access(owner_id,false,'full approved refund removes the last paid window despite replay');

  PERFORM public.record_paddle_sandbox_event(renewal || jsonb_build_object(
    'eventId','evt_'||repeat('h',26),'transactionId','txn_'||repeat('h',26)));
  PERFORM pg_temp.assert_access(owner_id,true,'separate eligible payment');
  PERFORM public.record_paddle_sandbox_event(jsonb_build_object('eventId','evt_'||repeat('i',26),'kind','subscription',
    'occurredAt',now_at,'subscriptionId',subid,'terminal',true,'cancelAt',now_at - interval '1 second'));
  PERFORM public.record_paddle_sandbox_event(state_event || jsonb_build_object('eventId','evt_'||repeat('j',26)));
  PERFORM pg_temp.assert_access(owner_id,false,'effective cancellation survives late older active update');

  IF has_function_privilege('authenticated','public.record_paddle_sandbox_event(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.register_paddle_sandbox_attempt(text,uuid,text,text)','EXECUTE')
    OR has_table_privilege('authenticated','private.paddle_sandbox_events','SELECT') THEN
    RAISE EXCEPTION 'Browser roles can write or inspect billing facts';
  END IF;
END;
$$;
ROLLBACK;
