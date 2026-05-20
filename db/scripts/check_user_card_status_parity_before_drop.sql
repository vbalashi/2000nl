\set ON_ERROR_STOP on

-- Run after migration 042 and before migration 052 on any database that still
-- contains legacy user_word_status. The script proves that dropping
-- user_word_status will not lose per-card FSRS state.

do $$
begin
  if to_regclass('public.user_word_status') is null then
    raise exception 'public.user_word_status is missing; run this before db/migrations/052_drop_legacy_user_word_status.sql';
  end if;

  if to_regclass('public.user_card_status') is null then
    raise exception 'public.user_card_status is missing; migration 042 has not created physical card state';
  end if;

  if exists (
    select 1
    from public.user_word_status
    where user_id is null or word_id is null or mode is null
  ) then
    raise exception 'legacy user_word_status contains null key fields';
  end if;

  if exists (
    select 1
    from public.user_card_status
    where user_id is null or entry_id is null or card_type_id is null
  ) then
    raise exception 'user_card_status contains null key fields';
  end if;

  if exists (
    select 1
    from public.user_word_status legacy
    left join public.user_card_status card
      on card.user_id = legacy.user_id
     and card.entry_id = legacy.word_id
     and card.card_type_id = legacy.mode
    where card.user_id is null
  ) then
    raise exception 'legacy user_word_status rows are missing from user_card_status';
  end if;

  if exists (
    select 1
    from public.user_card_status card
    left join public.user_word_status legacy
      on legacy.user_id = card.user_id
     and legacy.word_id = card.entry_id
     and legacy.mode = card.card_type_id
    where legacy.user_id is null
  ) then
    raise exception 'user_card_status rows are missing from legacy user_word_status';
  end if;

  if exists (
    select 1
    from public.user_word_status legacy
    join public.user_card_status card
      on card.user_id = legacy.user_id
     and card.entry_id = legacy.word_id
     and card.card_type_id = legacy.mode
    where card.fsrs_stability is distinct from legacy.fsrs_stability
       or card.fsrs_difficulty is distinct from legacy.fsrs_difficulty
       or card.fsrs_reps is distinct from legacy.fsrs_reps
       or card.fsrs_lapses is distinct from legacy.fsrs_lapses
       or card.fsrs_last_grade is distinct from legacy.fsrs_last_grade
       or card.fsrs_last_interval is distinct from legacy.fsrs_last_interval
       or card.fsrs_target_retention is distinct from legacy.fsrs_target_retention
       or card.fsrs_params_version is distinct from legacy.fsrs_params_version
       or card.fsrs_enabled is distinct from legacy.fsrs_enabled
       or card.next_review_at is distinct from legacy.next_review_at
       or card.last_seen_at is distinct from legacy.last_seen_at
       or card.last_reviewed_at is distinct from legacy.last_reviewed_at
       or card.click_count is distinct from legacy.click_count
       or card.seen_count is distinct from legacy.seen_count
       or card.success_count is distinct from legacy.success_count
       or card.last_result is distinct from legacy.last_result
       or card.hidden is distinct from legacy.hidden
       or card.frozen_until is distinct from legacy.frozen_until
       or card.in_learning is distinct from legacy.in_learning
       or card.learning_due_at is distinct from legacy.learning_due_at
  ) then
    raise exception 'user_card_status FSRS/state fields do not match legacy user_word_status';
  end if;

  if exists (
    select 1
    from public.user_review_log rl
    left join public.user_card_status card
      on card.user_id = rl.user_id
     and card.entry_id = rl.word_id
     and card.card_type_id = rl.mode
    where rl.user_id is not null
      and rl.word_id is not null
      and rl.mode is not null
      and card.user_id is null
  ) then
    raise exception 'review log contains user/card keys without user_card_status rows';
  end if;
end $$;

select 'user_card_status_parity_before_drop' as check_name, 'ok' as value;
