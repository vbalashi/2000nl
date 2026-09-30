\pset pager off
\pset format unaligned
\pset tuples_only on
\o :outfile
select json_agg(json_build_object('qid', queryid::text, 'role', userid::regrole::text,
  'fn', coalesce(substring(query from $re$"public"\."([a-z0-9_]+)"\($re$), left(regexp_replace(query, '\s+', ' ', 'g'), 70)),
  'calls', calls, 'total', total_exec_time, 'max', max_exec_time, 'plan', total_plan_time, 'tmp', temp_blks_written))
from pg_stat_statements;
\o
