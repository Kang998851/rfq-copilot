alter table public.companies
  add column if not exists contact_email text,
  add column if not exists contact_name text;

alter table public.rfqs
  add column if not exists buyer_email text;

alter table public.rfqs drop constraint if exists rfqs_status_check;
alter table public.rfqs add constraint rfqs_status_check
  check (status in ('processing','needs_review','matched','quoted','sent'));

alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check
  check (status in ('draft','ready','sent'));

alter table public.quotations
  add column if not exists sent_at timestamptz,
  add column if not exists pdf_document_id uuid references public.documents(id) on delete set null;

create table public.quotation_sends (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'prepared' check (status in ('prepared','sent','failed')),
  provider text not null default 'manual' check (provider in ('manual','resend','mailto')),
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index quotations_pdf_document_id_idx on public.quotations (pdf_document_id);
create index quotation_sends_company_id_idx on public.quotation_sends (company_id);
create index quotation_sends_quotation_id_idx on public.quotation_sends (quotation_id);
create index quotation_sends_rfq_id_idx on public.quotation_sends (rfq_id);

alter table public.quotation_sends enable row level security;
create policy "Members read quotation sends" on public.quotation_sends for select to authenticated using (public.is_company_member(company_id));
create policy "Members insert quotation sends" on public.quotation_sends for insert to authenticated with check (public.is_company_member(company_id));
create policy "Members update quotation sends" on public.quotation_sends for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
