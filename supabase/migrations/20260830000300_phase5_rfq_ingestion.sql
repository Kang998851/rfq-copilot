alter table public.documents
  add column if not exists checksum text,
  add column if not exists processing_status text not null default 'stored',
  add column if not exists page_count integer,
  add column if not exists ocr_used boolean not null default false;

alter table public.rfqs
  add column if not exists source_checksum text,
  add column if not exists possible_duplicate_of uuid references public.rfqs(id) on delete set null;

alter table public.rfqs drop constraint if exists rfqs_source_type_check;
alter table public.rfqs add constraint rfqs_source_type_check
  check (source_type in ('pdf','excel','csv','email','text','image'));

alter table public.rfq_items
  add column if not exists source_text text,
  add column if not exists source_ref text;

create index if not exists documents_checksum_idx on public.documents (company_id, checksum);
create index if not exists rfqs_source_checksum_idx on public.rfqs (company_id, source_checksum);
