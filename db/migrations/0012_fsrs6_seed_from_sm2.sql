-- One-time seeding of FSRS fields from existing SM2 data

-- Map SM2 values to FSRS approximations:
-- - stability ~ current SM2 interval
-- - difficulty derived from EF (inverse relation)
-- - reps/lapses carried over
-- - enable FSRS flag for migrated rows

update user_word_status
set fsrs_stability = greatest(1, sm2_interval::numeric),
    fsrs_difficulty = greatest(1, least(10, 11 - coalesce(sm2_ef, 2.5) * 2)), -- rough inverse of EF
    fsrs_reps = sm2_n,
    fsrs_lapses = case when sm2_n = 0 then 0 else greatest(0, sm2_n - success_count) end,
    fsrs_last_interval = sm2_interval,
    fsrs_last_grade = case when sm2_n > 0 then 3 else null end,
    fsrs_target_retention = coalesce(fsrs_target_retention, 0.9),
    fsrs_params_version = 'fsrs-6-default',
    fsrs_enabled = true
where fsrs_enabled is distinct from true;

-- Default all users to use FSRS unless explicitly turned off later
update user_settings
set use_fsrs = true
where use_fsrs is distinct from true;
