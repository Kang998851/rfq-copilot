alter table public.quotations
  add column if not exists outcome text not null default 'open';

alter table public.quotations
  add column if not exists outcome_note text;

alter table public.quotations
  add column if not exists follow_up_due timestamptz;

alter table public.quotations
  add column if not exists last_followed_up_at timestamptz;

alter table public.quotations drop constraint if exists quotations_outcome_check;
alter table public.quotations add constraint quotations_outcome_check
  check (outcome in ('open','won','lost'));

alter table public.rfqs drop constraint if exists rfqs_status_check;
alter table public.rfqs add constraint rfqs_status_check
  check (status in ('processing','needs_review','matched','quoted','sent','won','lost'));

update public.quotations
  set follow_up_due = sent_at + interval '3 days'
  where status = 'sent' and follow_up_due is null and sent_at is not null;

create index if not exists quotations_follow_up_due_idx on public.quotations (company_id, follow_up_due);
