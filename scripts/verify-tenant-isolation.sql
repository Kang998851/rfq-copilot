-- Synthetic A/B tenant isolation. Creates two throwaway auth users and companies,
-- asserts neither can read or write the other, then deletes the fixtures.
-- Returns only pass/fail labels. Do not select real customer emails or files.

create temporary table if not exists isolation_checks (
  check_name text primary key,
  passed boolean not null,
  detail text not null default ''
);

do $$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  company_a uuid;
  company_b uuid;
  product_a uuid;
  product_b uuid;
  rfq_a uuid;
  rfq_b uuid;
  quote_a uuid;
  quote_b uuid;
  seen int;
  blocked boolean;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    (inst, user_a, 'authenticated', 'authenticated', 'rfq-iso-a-' || user_a || '@invalid.test',
     crypt('iso', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
    (inst, user_b, 'authenticated', 'authenticated', 'rfq-iso-b-' || user_b || '@invalid.test',
     crypt('iso', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  insert into public.companies (name, country, industry, default_currency)
    values ('RFQ Isolation A', 'CN', 'Industrial', 'USD') returning id into company_a;

  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  insert into public.companies (name, country, industry, default_currency)
    values ('RFQ Isolation B', 'CN', 'Industrial', 'USD') returning id into company_b;

  insert into public.products (company_id, sku, name, cost, currency, active)
    values (company_a, 'ISO-A1', 'Isolation A', 10, 'USD', true) returning id into product_a;
  insert into public.products (company_id, sku, name, cost, currency, active)
    values (company_b, 'ISO-B1', 'Isolation B', 10, 'USD', true) returning id into product_b;
  insert into public.rfqs (company_id, reference, buyer_name, source_type, status)
    values (company_a, 'ISO-RFQ-A', 'Buyer A', 'text', 'processing') returning id into rfq_a;
  insert into public.rfqs (company_id, reference, buyer_name, source_type, status)
    values (company_b, 'ISO-RFQ-B', 'Buyer B', 'text', 'processing') returning id into rfq_b;
  insert into public.quotations (company_id, rfq_id, status, currency)
    values (company_a, rfq_a, 'draft', 'USD') returning id into quote_a;
  insert into public.quotations (company_id, rfq_id, status, currency)
    values (company_b, rfq_b, 'draft', 'USD') returning id into quote_b;

  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.products where id = product_a;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('A reads own product', seen = 1, seen::text);
  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.products where id = product_b;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('A cannot read B product', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.companies where id = company_b;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('A cannot read B company', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.rfqs where id = rfq_b;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('A cannot read B rfq', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.quotations where id = quote_b;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('A cannot read B quote', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.company_members where user_id = user_b;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('A cannot enumerate B membership', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  update public.products set description = 'blocked' where id = product_b;
  get diagnostics seen = row_count;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('A cannot update B product', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.products (company_id, sku, name, currency) values (company_b, 'BLOCK-A', 'Blocked', 'USD');
    blocked := false;
  exception when others then
    blocked := true;
  end;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('A cannot insert into B', blocked, '');

  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.products where id = product_b;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('B reads own product', seen = 1, seen::text);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.products where id = product_a;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('B cannot read A product', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.companies where id = company_a;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('B cannot read A company', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.rfqs where id = rfq_a;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('B cannot read A rfq', seen = 0, seen::text);
  perform set_config('role', 'authenticated', true);
  select count(*) into seen from public.quotations where id = quote_a;
  perform set_config('role', 'none', true);
  insert into isolation_checks values ('B cannot read A quote', seen = 0, seen::text);

  delete from public.companies where id in (company_a, company_b);
  delete from auth.users where id in (user_a, user_b);
exception when others then
  perform set_config('role', 'postgres', true);
  delete from public.companies where name in ('RFQ Isolation A', 'RFQ Isolation B');
  delete from auth.users where email like 'rfq-iso-%@invalid.test';
  insert into isolation_checks values ('fixture cleanup after error', false, sqlerrm)
    on conflict (check_name) do update set passed = excluded.passed, detail = excluded.detail;
end;
$$;

select check_name, passed, detail from isolation_checks order by check_name;
