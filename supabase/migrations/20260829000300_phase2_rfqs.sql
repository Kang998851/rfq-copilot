create table public.rfqs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference text not null,
  buyer_name text not null default '',
  source_type text not null check (source_type in ('pdf','excel','csv','email','text')),
  source_filename text,
  document_id uuid references public.documents(id) on delete set null,
  status text not null default 'processing' check (status in ('processing','needs_review','matched','quoted')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reference)
);
create table public.rfq_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  line_no integer not null,
  requirement text not null,
  quantity numeric,
  unit text,
  specs jsonb not null default '{}'::jsonb,
  matched_product_id uuid references public.products(id) on delete set null,
  matched_sku text,
  confidence integer not null default 0 check (confidence >= 0 and confidence <= 100),
  missing text[] not null default '{}',
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (rfq_id, line_no)
);
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','ready')),
  currency text not null default 'USD',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  rfq_item_id uuid references public.rfq_items(id) on delete set null,
  sku text,
  name text not null,
  quantity numeric,
  unit text,
  unit_price numeric,
  lead_time_days integer,
  notes text
);
create index rfqs_document_id_idx on public.rfqs (document_id);
create index rfqs_created_by_idx on public.rfqs (created_by);
create index rfqs_company_created_idx on public.rfqs (company_id, created_at desc);
create index rfq_items_company_id_idx on public.rfq_items (company_id);
create index rfq_items_rfq_id_idx on public.rfq_items (rfq_id);
create index rfq_items_matched_product_id_idx on public.rfq_items (matched_product_id);
create index quotations_company_id_idx on public.quotations (company_id);
create index quotations_rfq_id_idx on public.quotations (rfq_id);
create index quotation_items_company_id_idx on public.quotation_items (company_id);
create index quotation_items_quotation_id_idx on public.quotation_items (quotation_id);
create index quotation_items_rfq_item_id_idx on public.quotation_items (rfq_item_id);
alter table public.rfqs enable row level security;
alter table public.rfq_items enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
create policy "Members read rfqs" on public.rfqs for select to authenticated using (public.is_company_member(company_id));
create policy "Members insert rfqs" on public.rfqs for insert to authenticated with check (public.is_company_member(company_id));
create policy "Members update rfqs" on public.rfqs for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "Members delete rfqs" on public.rfqs for delete to authenticated using (public.is_company_member(company_id));
create policy "Members read rfq items" on public.rfq_items for select to authenticated using (public.is_company_member(company_id));
create policy "Members insert rfq items" on public.rfq_items for insert to authenticated with check (public.is_company_member(company_id));
create policy "Members update rfq items" on public.rfq_items for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "Members delete rfq items" on public.rfq_items for delete to authenticated using (public.is_company_member(company_id));
create policy "Members read quotations" on public.quotations for select to authenticated using (public.is_company_member(company_id));
create policy "Members insert quotations" on public.quotations for insert to authenticated with check (public.is_company_member(company_id));
create policy "Members update quotations" on public.quotations for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "Members delete quotations" on public.quotations for delete to authenticated using (public.is_company_member(company_id));
create policy "Members read quotation items" on public.quotation_items for select to authenticated using (public.is_company_member(company_id));
create policy "Members insert quotation items" on public.quotation_items for insert to authenticated with check (public.is_company_member(company_id));
create policy "Members update quotation items" on public.quotation_items for update to authenticated using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "Members delete quotation items" on public.quotation_items for delete to authenticated using (public.is_company_member(company_id));
