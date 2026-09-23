const functionStatsSql = `SELECT COALESCE(
  json_agg(json_build_object(
    'functionOid', function_stats.funcid::text,
    'signature', format(
      '%I.%I(%s)', namespace.nspname, procedure.proname,
      replace(oidvectortypes(procedure.proargtypes), ', ', ',')
    ),
    'schema', namespace.nspname,
    'function', procedure.proname,
    'calls', function_stats.calls,
    'totalMs', round(function_stats.total_time::numeric, 3),
    'selfMs', round(function_stats.self_time::numeric, 3)
  ) ORDER BY function_stats.total_time DESC)::text,
  '[]'
)
FROM pg_stat_user_functions function_stats
JOIN pg_proc procedure ON procedure.oid = function_stats.funcid
JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
WHERE function_stats.calls > 0
  AND (procedure.proname LIKE '%training%' OR procedure.proname LIKE '%schedule%');`;

const schedulerCandidatesSignature =
  'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)';

const requiredFunctionsByOverload = {
  public: [
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)',
    schedulerCandidatesSignature,
  ],
  uiPublic: [
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)',
    'private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
    schedulerCandidatesSignature,
  ],
};

export function sessionPlanFunctionStatsSql() {
  return functionStatsSql;
}

export function sessionPlanFunctionStatsDelta(beforeRows, afterRows) {
  const beforeByOid = new Map();
  for (const row of beforeRows) {
    const oid = String(row.functionOid ?? '');
    if (!/^\d+$/.test(oid)) throw new Error('Function statistics row is missing a valid OID');
    if (beforeByOid.has(oid)) throw new Error(`Duplicate function statistics OID ${oid}`);
    beforeByOid.set(oid, row);
  }

  const seenAfterOids = new Set();
  const delta = [];
  for (const row of afterRows) {
    const oid = String(row.functionOid ?? '');
    if (!/^\d+$/.test(oid)) throw new Error('Function statistics row is missing a valid OID');
    if (seenAfterOids.has(oid)) throw new Error(`Duplicate function statistics OID ${oid}`);
    seenAfterOids.add(oid);

    const before = beforeByOid.get(oid);
    if (before && before.signature !== row.signature) {
      throw new Error(`Function signature changed for OID ${oid}`);
    }
    const priorCalls = Number(before?.calls ?? 0);
    const currentCalls = Number(row.calls);
    if (!Number.isSafeInteger(priorCalls) || !Number.isSafeInteger(currentCalls)) {
      throw new Error(`Invalid call count for function OID ${oid}`);
    }
    if (currentCalls < priorCalls) {
      throw new Error(`Function statistics counters moved backwards for OID ${oid}`);
    }
    const calls = currentCalls - priorCalls;
    if (calls === 0) continue;

    const totalMs = Number(row.totalMs) - Number(before?.totalMs ?? 0);
    const selfMs = Number(row.selfMs) - Number(before?.selfMs ?? 0);
    if (!Number.isFinite(totalMs) || !Number.isFinite(selfMs) || totalMs < 0 || selfMs < 0) {
      throw new Error(`Invalid timing delta for function OID ${oid}`);
    }
    delta.push({
      ...row,
      functionOid: oid,
      calls,
      totalMs: Number(totalMs.toFixed(3)),
      selfMs: Number(selfMs.toFixed(3)),
    });
  }
  return delta;
}

export function assertSessionPlanFunctionStats(rows, overload) {
  const expected = requiredFunctionsByOverload[overload];
  if (!expected) throw new Error(`Unknown session-plan overload ${overload}`);
  const missing = expected.filter((signature) =>
    !rows.some((row) => row.signature === signature && row.calls > 0),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing tracked ${overload} wrapper/helper calls: ${missing.join(', ')}`,
    );
  }
}
