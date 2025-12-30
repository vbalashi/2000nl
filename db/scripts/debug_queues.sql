-- Debug script to understand queue states and counter calculations
-- Usage: psql "$SUPABASE_DB_URL" -f db/scripts/debug_queues.sql

\echo '=============================================='
\echo 'QUEUE DEBUG REPORT'
\echo '=============================================='
\echo ''

\echo '--- 1. USER INFO ---'
SELECT 
    us.user_id,
    us.daily_new_limit,
    us.new_review_ratio,
    us.active_scenario
FROM user_settings us
WHERE us.user_id = (SELECT user_id FROM user_word_status ORDER BY last_seen_at DESC LIMIT 1);

\echo ''
\echo '--- 2. TODAY''S REVIEW LOG SUMMARY ---'
SELECT 
    review_type,
    COUNT(*) as count,
    COUNT(DISTINCT word_id) as distinct_words
FROM user_review_log
WHERE user_id = (SELECT user_id FROM user_word_status ORDER BY last_seen_at DESC LIMIT 1)
  AND reviewed_at::date = current_date
GROUP BY review_type
ORDER BY review_type;

\echo ''
\echo '--- 3. NEW QUEUE: Cards introduced today ---'
\echo '    (Words with review_type = ''new'' today)'
SELECT 
    w.headword,
    rl.mode,
    rl.grade,
    rl.reviewed_at,
    s.fsrs_last_interval as current_interval,
    CASE WHEN s.fsrs_last_interval >= 1.0 THEN 'GRADUATED (counts in x)' ELSE 'LEARNING (not yet)' END as status
FROM user_review_log rl
JOIN word_entries w ON w.id = rl.word_id
LEFT JOIN user_word_status s ON s.word_id = rl.word_id 
    AND s.user_id = rl.user_id 
    AND s.mode = rl.mode
WHERE rl.user_id = (SELECT user_id FROM user_word_status ORDER BY last_seen_at DESC LIMIT 1)
  AND rl.review_type = 'new'
  AND rl.reviewed_at::date = current_date
ORDER BY rl.reviewed_at DESC
LIMIT 20;

\echo ''
\echo '--- 4. REVIEW QUEUE: Cards due today (NOT new today) ---'
\echo '    (Words in review queue, due before midnight)'
SELECT 
    w.headword,
    s.mode,
    s.fsrs_last_interval as interval_days,
    s.next_review_at,
    CASE WHEN s.fsrs_last_interval >= 1.0 THEN 'GRADUATED' ELSE 'STRUGGLING' END as state
FROM user_word_status s
JOIN word_entries w ON w.id = s.word_id
WHERE s.user_id = (SELECT user_id FROM user_word_status ORDER BY last_seen_at DESC LIMIT 1)
  AND s.next_review_at < (current_date + interval '1 day')
  AND s.hidden = false
  AND s.fsrs_enabled = true
  -- Exclude cards introduced TODAY (they are NEW queue)
  AND NOT EXISTS (
      SELECT 1 FROM user_review_log rl
      WHERE rl.user_id = s.user_id
        AND rl.word_id = s.word_id
        AND rl.mode = s.mode
        AND rl.review_type = 'new'
        AND rl.reviewed_at::date = current_date
  )
ORDER BY s.next_review_at ASC
LIMIT 30;

\echo ''
\echo '--- 5. REVIEWS DONE TODAY (review_type = ''review'') ---'
SELECT 
    w.headword,
    rl.mode,
    rl.grade,
    rl.interval_after,
    CASE WHEN rl.interval_after >= 1.0 THEN 'DONE (counts in y)' ELSE 'STRUGGLING (not done)' END as status
FROM user_review_log rl
JOIN word_entries w ON w.id = rl.word_id
WHERE rl.user_id = (SELECT user_id FROM user_word_status ORDER BY last_seen_at DESC LIMIT 1)
  AND rl.review_type = 'review'
  AND rl.reviewed_at::date = current_date
ORDER BY rl.reviewed_at DESC
LIMIT 20;

\echo ''
\echo '--- 6. COUNTER CALCULATION ---'
WITH user_data AS (
    SELECT user_id FROM user_word_status ORDER BY last_seen_at DESC LIMIT 1
),
modes AS (
    SELECT ARRAY['word-to-definition', 'definition-to-word'] as enabled_modes
)
SELECT
    -- NIEUW x: New cards introduced today that have GRADUATED
    (SELECT COUNT(DISTINCT rl.word_id) 
     FROM user_review_log rl
     JOIN user_word_status s ON s.word_id = rl.word_id AND s.user_id = rl.user_id AND s.mode = rl.mode
     FROM user_data ud, modes m
     WHERE rl.user_id = ud.user_id
       AND rl.mode = ANY(m.enabled_modes)
       AND rl.review_type = 'new'
       AND rl.reviewed_at::date = current_date
       AND s.fsrs_last_interval >= 1.0) as nieuw_x_graduated,
    
    -- NIEUW X: Daily limit
    (SELECT COALESCE(daily_new_limit, 10) FROM user_settings, user_data ud WHERE user_id = ud.user_id) as nieuw_X_limit,
    
    -- HERHALING y: Review cards done today (graduated after review)
    (SELECT COUNT(*) 
     FROM user_review_log rl, user_data ud, modes m
     WHERE rl.user_id = ud.user_id
       AND rl.mode = ANY(m.enabled_modes)
       AND rl.review_type = 'review'
       AND rl.reviewed_at::date = current_date
       AND rl.interval_after >= 1.0) as herhaling_y_done,
    
    -- HERHALING Y: Review cards due today (NOT new cards)
    (SELECT COUNT(*) 
     FROM user_word_status s
     JOIN word_entries w ON w.id = s.word_id, user_data ud, modes m
     WHERE s.user_id = ud.user_id
       AND s.mode = ANY(m.enabled_modes)
       AND s.next_review_at < (current_date + interval '1 day')
       AND s.hidden = false
       AND s.fsrs_enabled = true
       AND w.is_nt2_2000 = true
       AND NOT EXISTS (
           SELECT 1 FROM user_review_log rl
           WHERE rl.user_id = s.user_id
             AND rl.word_id = s.word_id
             AND rl.mode = s.mode
             AND rl.review_type = 'new'
             AND rl.reviewed_at::date = current_date
       )) as herhaling_Y_due_today,
    
    -- TOTAAL
    (SELECT COUNT(DISTINCT s.word_id) 
     FROM user_word_status s
     JOIN word_entries w ON w.id = s.word_id, user_data ud, modes m
     WHERE s.user_id = ud.user_id
       AND s.mode = ANY(m.enabled_modes)
       AND s.fsrs_enabled = true
       AND w.is_nt2_2000 = true) as totaal_learned;

\echo ''
\echo '--- 7. COUNTER EXPLANATION ---'
\echo ''
\echo 'NIEUW (x/X):'
\echo '  x = New words introduced today that have GRADUATED (interval >= 1 day)'
\echo '  X = daily_new_limit from settings'
\echo ''
\echo 'HERHALING (y/Y):'
\echo '  y = Review cards done today where interval_after >= 1 day'
\echo '  Y = Review cards due today (fixed at session start, excludes NEW queue)'
\echo ''
\echo 'Key rules:'
\echo '  - NEW queue cards never count in HERHALING'
\echo '  - Cards stay in their queue for the day'
\echo '  - "Done" = interval >= 1 day (graduated)'
