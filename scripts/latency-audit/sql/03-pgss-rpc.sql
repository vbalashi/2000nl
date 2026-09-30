\pset pager off
begin read only;
set local statement_timeout = '60s';
select coalesce(substring(query from $re$"public"\."([a-z0-9_]+)"\($re$), left(regexp_replace(query, '\s+', ' ', 'g'), 60)) fn,
       calls,
       round(mean_exec_time::numeric,0) mean_ms,
       round(max_exec_time::numeric,0) max_ms,
       round(total_exec_time::numeric/1000,0) total_s,
       round(shared_blks_hit::numeric/greatest(calls,1),0) hit_blk,
       round(shared_blks_read::numeric/greatest(calls,1),0) rd_blk,
       temp_blks_written tmp_blk
from pg_stat_statements
where query like 'WITH pgrst_source%' and calls >= 3
order by total_exec_time desc
limit 45;
commit;
