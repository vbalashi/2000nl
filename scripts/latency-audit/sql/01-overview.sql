\set ON_ERROR_STOP on
\pset pager off
begin read only;
set local statement_timeout = '60s';
select current_setting('server_version') as pg, current_setting('pg_stat_statements.track', true) as pgss_track,
       current_setting('pg_stat_statements.max', true) as pgss_max;
select extname, extversion from pg_extension where extname in ('pg_stat_statements','auto_explain','pg_trgm','unaccent');
select stats_reset from pg_stat_statements_info;
-- table sizes
select relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) total
from pg_stat_user_tables
where schemaname='public' and relname in (
 'word_entries','user_review_log','user_card_status','user_card_action_events','platform_v2_action_receipts',
 'dictionary_search_documents','dictionary_search_fields','word_entry_translations','training_sessions',
 'training_session_members','training_session_action_bindings','training_active_runs','word_list_items',
 'user_word_list_items','connected_client_sessions','user_settings')
order by pg_total_relation_size(relid) desc;
-- per-user history scale
select count(*) users, max(c) max_reviews, percentile_cont(0.5) within group (order by c) p50, percentile_cont(0.95) within group (order by c) p95
from (select user_id, count(*) c from user_review_log group by user_id) s;
select count(*) users, max(c) max_states, percentile_cont(0.95) within group (order by c) p95
from (select user_id, count(*) c from user_card_status group by user_id) s;
commit;
