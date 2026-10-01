\pset pager off
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP on
\o :outfile
select coalesce(json_agg(json_build_object('qid',queryid::text,'role',userid::regrole::text,'fn',substring(query from $re$"public"\."([a-z0-9_]+)"\($re$),'calls',calls,'total',total_exec_time,'max',max_exec_time,'tmp',temp_blks_written)), '[]'::json)
from pg_stat_statements where query ~ $re$"public"\."[a-z0-9_]+"\($re$;
\o
