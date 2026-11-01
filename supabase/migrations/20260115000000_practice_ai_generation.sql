-- =====================================================================
-- MockMate — AI-generated practice questions (additive)
-- =====================================================================
-- The Practice Hub now fills a shortfall with AI-generated MCQs when the bank
-- has fewer matching questions than the student requested.
--
-- Additive only:
--   * `prompt_key`        deterministic dedupe key (category|topic|prompt)
--   * `source`            provenance: 'manual' (existing rows), 'ai', 'pdf'
--   * `source_pdf_name`   reserved for the planned master-PDF import
--   * `source_pdf_page`   reserved for the planned master-PDF import
--   * `source_reference`  reserved reference question id from the PDF
--
-- No existing column, row or policy is modified. The unique index on
-- `prompt_key` is what makes concurrent generation safe: two requests racing on
-- the same question insert once and the loser is a no-op.
-- =====================================================================

alter table public.practice_questions
  add column if not exists prompt_key text,
  add column if not exists source text not null default 'manual',
  add column if not exists source_pdf_name text,
  add column if not exists source_pdf_page integer,
  add column if not exists source_reference text;

-- Constrain provenance without breaking existing rows (all default to manual).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'practice_questions_source_check'
  ) then
    alter table public.practice_questions
      add constraint practice_questions_source_check
      check (source in ('manual', 'ai', 'pdf'));
  end if;
end $$;

create unique index if not exists practice_questions_prompt_key_idx
  on public.practice_questions (prompt_key)
  where prompt_key is not null;

create index if not exists practice_questions_source_idx
  on public.practice_questions (source)
  where is_active;

comment on column public.practice_questions.prompt_key is
  'Deterministic sha256 of category|topic|normalised prompt. Unique when present; makes concurrent AI generation idempotent.';
comment on column public.practice_questions.source is
  'Provenance of the question: manual, ai or pdf. Never used to relax validation.';
comment on column public.practice_questions.source_pdf_name is
  'Reserved for the planned master-PDF import. NULL for every other source.';
comment on column public.practice_questions.source_pdf_page is
  'Reserved for the planned master-PDF import. NULL for every other source.';
comment on column public.practice_questions.source_reference is
  'Reserved reference question id from an imported source document.';

-- Browser sessions still cannot read the bank: correct answers and
-- explanations stay backend-only until a student answers.
revoke all on table public.practice_questions from public, anon, authenticated;
grant select, insert, update, delete on table public.practice_questions to service_role;
