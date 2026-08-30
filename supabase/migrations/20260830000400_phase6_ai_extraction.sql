alter table public.rfqs
  add column if not exists extracted_header jsonb not null default '{}'::jsonb,
  add column if not exists extraction_status text not null default 'heuristic';

alter table public.rfqs drop constraint if exists rfqs_extraction_status_check;
alter table public.rfqs add constraint rfqs_extraction_status_check
  check (extraction_status in ('heuristic','ai','failed'));

alter table public.rfq_items
  add column if not exists requested_sku text,
  add column if not exists target_price numeric,
  add column if not exists extract_confidence numeric;

alter table public.rfq_items drop constraint if exists rfq_items_extract_confidence_check;
alter table public.rfq_items add constraint rfq_items_extract_confidence_check
  check (extract_confidence is null or (extract_confidence >= 0 and extract_confidence <= 1));
