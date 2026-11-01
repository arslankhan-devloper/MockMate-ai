-- =====================================================================
-- MockMate — adaptive interview questions + correctness evaluation
-- =====================================================================
-- Additive migration. It stores:
--   * a correctness verdict, correctness score and concept/error detail for
--     each real answer evaluation;
--   * provenance for a generated question on the next interview turn, including
--     the hash of the answer it was adapted from.
--
-- The existing evaluation row remains one per (session_id, question_index).
-- An adaptive next question is stored on the next turn before that question is
-- answered; the base answer-save upsert then updates the same row, so retries
-- can never create a second question at that index.
--
-- Safety: additive only (`if not exists`). Existing rows keep safe defaults:
-- turns become `static`; correctness fields are null/empty so older reports
-- explicitly show "not available" instead of inventing a verdict.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Correctness detail on the existing evaluation row
-- ---------------------------------------------------------------------
alter table public.interview_turn_evaluations
  add column if not exists correctness_verdict text,
  add column if not exists correctness_score numeric,
  add column if not exists key_concepts_covered text[] not null default '{}',
  add column if not exists key_concepts_missing text[] not null default '{}',
  add column if not exists factual_errors text[] not null default '{}',
  add column if not exists expected_answer text not null default '',
  add column if not exists improvement_advice text not null default '',
  add column if not exists confidence numeric;

do $$
begin
  alter table public.interview_turn_evaluations
    drop constraint if exists interview_turn_evaluations_correctness_verdict_check;
  alter table public.interview_turn_evaluations
    add constraint interview_turn_evaluations_correctness_verdict_check
    check (
      correctness_verdict is null
      or correctness_verdict in (
        'correct',
        'mostly_correct',
        'partially_correct',
        'incorrect',
        'insufficient_information',
        'not_applicable'
      )
    );

  if not exists (
    select 1 from pg_constraint
    where conname = 'interview_turn_evaluations_correctness_score_check'
  ) then
    alter table public.interview_turn_evaluations
      add constraint interview_turn_evaluations_correctness_score_check
      check (correctness_score is null or (correctness_score >= 0 and correctness_score <= 100));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'interview_turn_evaluations_confidence_check'
  ) then
    alter table public.interview_turn_evaluations
      add constraint interview_turn_evaluations_confidence_check
      check (confidence is null or (confidence >= 0 and confidence <= 1));
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Generated-question provenance on the next turn
-- ---------------------------------------------------------------------
alter table public.interview_turns
  add column if not exists question_source text not null default 'static',
  add column if not exists question_difficulty text,
  add column if not exists question_topic text,
  add column if not exists generation_source_answer_hash text,
  add column if not exists generation_rationale text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'interview_turns_question_source_check'
  ) then
    alter table public.interview_turns
      add constraint interview_turns_question_source_check
      check (question_source in ('static', 'ai'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'interview_turns_question_difficulty_check'
  ) then
    alter table public.interview_turns
      add constraint interview_turns_question_difficulty_check
      check (question_difficulty is null or question_difficulty in ('easy', 'medium', 'hard'));
  end if;
end
$$;

-- Speeds up the idempotent lookup of a question generated from one answer.
create index if not exists interview_turns_generation_source_idx
  on public.interview_turns (session_id, generation_source_answer_hash)
  where generation_source_answer_hash is not null;

comment on column public.interview_turn_evaluations.correctness_verdict is
  'correct | mostly_correct | partially_correct | incorrect | insufficient_information | not_applicable, or null when unavailable.';
comment on column public.interview_turn_evaluations.correctness_score is
  'Separate 0-100 correctness score, never a placeholder.';
comment on column public.interview_turns.generation_source_answer_hash is
  'Hash of the previous answer used to generate this question (idempotency).';
