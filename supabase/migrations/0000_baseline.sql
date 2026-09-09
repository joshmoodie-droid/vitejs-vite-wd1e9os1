-- ============================================================================
-- Baseline schema snapshot — production project qwycavfmdpknnflxlylw
-- Captured 2026-09-10 by introspection (no pg_dump on the build box).
--
-- This is the COMPLETE current schema with migrations 0001-0009 already folded
-- in. It is used to stand up the staging project (qliapjpxwlcnyjfwfdor) and as a
-- disaster-recovery reference. It is NOT meant to be replayed on top of the
-- numbered migrations.
--
-- Deliberately excluded:
--   * notify_requests / notify_quotes  — the pg_net webhook triggers that call
--     the notify edge function. Staging must never send email, so they are left
--     off; add them by hand on prod-like environments only.
--   * Supabase-managed roles, the auth/storage schemas, and default extensions
--     (pgcrypto, uuid-ossp, pg_net, ...) — present on every Supabase project.
-- ============================================================================

-- ---------- extensions (already present on Supabase; here for a bare Postgres) -
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ---------- tables ----------------------------------------------------------
create table if not exists public.suppliers (
  id uuid default gen_random_uuid() not null,
  company_name text not null,
  service_area text default ''::text,
  contact_email text,
  contact_phone text,
  created_at timestamptz default now(),
  auth_user_id uuid,
  constraint suppliers_pkey PRIMARY KEY (id),
  constraint suppliers_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)
);

create table if not exists public.supplier_pricing (
  supplier_id uuid not null,
  hose jsonb default '{}'::jsonb not null,
  fitting jsonb default '{}'::jsonb not null,
  labour_base numeric default 15,
  crimp_charge numeric default 8,
  travel_base numeric default 45,
  callout_fee numeric default 65,
  labour_hourly_rate numeric default 85,
  constraint supplier_pricing_pkey PRIMARY KEY (supplier_id),
  constraint supplier_pricing_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

create table if not exists public.requests (
  id text not null,
  request_type text default 'quote'::text not null,
  status text default 'open'::text not null,
  selected_supplier_id uuid,
  urgency text default 'standard'::text,
  location text,
  field_service_requested boolean default false,
  site_address text,
  access_notes text,
  fs_labour_hours_estimate text,
  name text,
  phone text,
  email text,
  preferred_time text,
  notes text,
  photo_url text,
  assemblies jsonb,
  equipment_type text,
  issue text,
  description text,
  labour_hours_estimate text,
  created_at timestamptz default now(),
  access_token uuid default gen_random_uuid() not null,
  customer_id uuid,
  constraint requests_pkey PRIMARY KEY (id),
  constraint requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES auth.users(id),
  constraint requests_selected_supplier_id_fkey FOREIGN KEY (selected_supplier_id) REFERENCES suppliers(id)
);

create table if not exists public.quotes (
  id text not null,
  request_id text not null,
  supplier_id uuid not null,
  is_booking boolean default false,
  price_low numeric,
  price_high numeric,
  lead_time_days integer,
  quote_type text,
  status text default 'pending'::text,
  callout_fee numeric,
  travel_charge numeric,
  labour numeric,
  hose_assembly_cost numeric,
  customer_labour_hours text,
  field_service jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz,
  constraint quotes_pkey PRIMARY KEY (id),
  constraint quotes_request_id_fkey FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  constraint quotes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

create table if not exists public.connections (
  id text not null,
  quote_id text not null,
  unlocked boolean default false,
  unlocked_at timestamptz,
  constraint connections_pkey PRIMARY KEY (id),
  constraint connections_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);

create table if not exists public.profiles (
  id uuid not null,
  full_name text,
  phone text,
  email text,
  created_at timestamptz default now() not null,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

create table if not exists public.app_admin_emails (
  email text not null,
  constraint app_admin_emails_pkey PRIMARY KEY (email)
);

-- ---------- indexes -------------------------------------------------------
create index if not exists requests_access_token_idx ON public.requests USING btree (access_token);
create index if not exists requests_customer_id_idx ON public.requests USING btree (customer_id);
create index if not exists requests_email_lower_idx ON public.requests USING btree (lower(email));
create unique index if not exists suppliers_auth_user_id_key ON public.suppliers USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

-- ---------- functions ------------------------------------------------------
-- (defined before the policies and triggers that call them)
CREATE OR REPLACE FUNCTION public.accept_quote_by_token(p_request_id text, p_token uuid, p_quote_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fs jsonb;
begin
  if not exists (
    select 1 from public.requests
    where id = p_request_id and access_token = p_token
  ) then
    raise exception 'invalid request or token';
  end if;

  select field_service into fs from public.quotes
   where id = p_quote_id and request_id = p_request_id;
  if fs is not null and fs ->> 'status' = 'quoted' then
    fs := jsonb_set(fs, '{status}', '"confirmed"');
  end if;

  update public.quotes set status = 'accepted', field_service = fs
   where id = p_quote_id and request_id = p_request_id;

  update public.quotes set status = 'declined'
   where request_id = p_request_id and id <> p_quote_id and status <> 'declined';

  update public.requests set status = 'accepted' where id = p_request_id;

  insert into public.connections (id, quote_id, unlocked)
  values ('C-' || replace(gen_random_uuid()::text, '-', ''), p_quote_id, false)
  on conflict do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_my_requests()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  update public.requests
     set customer_id = auth.uid()
   where customer_id is null
     and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  get diagnostics n = row_count;
  return n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_supplier()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sid uuid;
begin
  update public.suppliers s
     set auth_user_id = auth.uid()
   where s.id = (
     select id from public.suppliers
     where auth_user_id is null
       and lower(contact_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     order by created_at
     limit 1
   )
   returning s.id into sid;

  if sid is null then
    select id into sid from public.suppliers where auth_user_id = auth.uid();
  end if;

  return sid;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_auto_quote(q jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if q ->> 'quote_type' is distinct from 'auto'
     or q ->> 'status' is distinct from 'pending'
     or not exists (select 1 from public.requests  where id = q ->> 'request_id')
     or not exists (select 1 from public.suppliers where id = (q ->> 'supplier_id')::uuid)
  then
    raise exception 'invalid auto-quote';
  end if;

  insert into public.quotes
  select * from jsonb_populate_record(null::public.quotes, q);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_request(r jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.requests;
begin
  if (r ->> 'customer_id') is not null
     and (r ->> 'customer_id')::uuid is distinct from auth.uid() then
    raise exception 'cannot create a request for another user';
  end if;

  rec := jsonb_populate_record(null::public.requests, r);
  if rec.access_token is null then rec.access_token := gen_random_uuid(); end if;
  if rec.created_at  is null then rec.created_at  := now(); end if;

  insert into public.requests values (rec.*) returning * into rec;

  return json_build_object(
    'id', rec.id,
    'access_token', rec.access_token,
    'created_at', rec.created_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_request_by_token(p_request_id text, p_token uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'request', json_build_object(
      'id', r.id, 'request_type', r.request_type, 'status', r.status,
      'location', r.location, 'created_at', r.created_at),
    'quotes', coalesce((
      select json_agg(json_build_object(
        'id', q.id, 'status', q.status, 'price_low', q.price_low, 'price_high', q.price_high,
        'lead_time_days', q.lead_time_days, 'supplier_id', q.supplier_id, 'field_service', q.field_service
      ) order by q.created_at desc)
      from public.quotes q
      where q.request_id = r.id and q.status <> 'declined'), '[]'::json),
    'supplier', (
      select json_build_object(
        'company_name', s.company_name,
        'contact_email', s.contact_email,
        'contact_phone', s.contact_phone)
      from public.suppliers s
      where s.id = (
        select q2.supplier_id from public.quotes q2
        where q2.request_id = r.id and q2.status in ('accepted', 'completed')
        order by q2.created_at desc limit 1))
  )
  from public.requests r
  where r.id = p_request_id and r.access_token = p_token;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.app_admin_emails a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_my_request(p_request_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.requests
    where id = p_request_id and customer_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.my_supplier_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.suppliers where auth_user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.quote_owned_by_supplier(p_quote_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.my_supplier_id() is not null and exists (
    select 1 from public.quotes
    where id = p_quote_id and supplier_id = public.my_supplier_id());
$function$
;

CREATE OR REPLACE FUNCTION public.quote_visible_to_me(p_quote_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.quotes q
    where q.id = p_quote_id
      and (q.supplier_id = public.my_supplier_id()
           or public.is_my_request(q.request_id)));
$function$
;

CREATE OR REPLACE FUNCTION public.supplier_on_request(p_request_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.my_supplier_id() is not null and exists (
    select 1 from public.quotes
    where request_id = p_request_id and supplier_id = public.my_supplier_id());
$function$
;

-- ---------- grants ----------------------------------------------------
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

grant execute on function public.accept_quote_by_token to anon, authenticated, service_role;
grant execute on function public.claim_my_requests to anon, authenticated, service_role;
grant execute on function public.claim_supplier to anon, authenticated, service_role;
grant execute on function public.create_auto_quote to anon, authenticated, service_role;
grant execute on function public.create_request to anon, authenticated, service_role;
grant execute on function public.get_request_by_token to anon, authenticated, service_role;
grant execute on function public.handle_new_user to anon, authenticated, service_role;
grant execute on function public.is_admin to anon, authenticated, service_role;
grant execute on function public.is_my_request to anon, authenticated, service_role;
grant execute on function public.my_supplier_id to anon, authenticated, service_role;
grant execute on function public.quote_owned_by_supplier to anon, authenticated, service_role;
grant execute on function public.quote_visible_to_me to anon, authenticated, service_role;
grant execute on function public.supplier_on_request to anon, authenticated, service_role;

-- ---------- row level security ------------------------------------------
alter table public.suppliers enable row level security;
alter table public.supplier_pricing enable row level security;
alter table public.requests enable row level security;
alter table public.quotes enable row level security;
alter table public.connections enable row level security;
alter table public.profiles enable row level security;
alter table public.app_admin_emails enable row level security;

-- ---------- policies ----------------------------------------------------
create policy "connections_insert" on public.connections for insert
  with check ((is_admin() OR quote_owned_by_supplier(quote_id)));

create policy "connections_select" on public.connections for select
  using ((is_admin() OR quote_visible_to_me(quote_id)));

create policy "connections_update" on public.connections for update
  using ((is_admin() OR quote_owned_by_supplier(quote_id)))
  with check ((is_admin() OR quote_owned_by_supplier(quote_id)));

create policy "profiles: insert own" on public.profiles for insert
  with check ((auth.uid() = id));

create policy "profiles: read own" on public.profiles for select
  using ((auth.uid() = id));

create policy "profiles: update own" on public.profiles for update
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

create policy "quotes_insert" on public.quotes for insert
  with check ((is_admin() OR (supplier_id = my_supplier_id())));

create policy "quotes_select" on public.quotes for select
  using ((is_admin() OR (supplier_id = my_supplier_id()) OR is_my_request(request_id)));

create policy "quotes_update" on public.quotes for update
  using ((is_admin() OR (supplier_id = my_supplier_id())))
  with check ((is_admin() OR (supplier_id = my_supplier_id())));

create policy "requests_select" on public.requests for select
  using ((is_admin() OR (customer_id = auth.uid()) OR (selected_supplier_id = my_supplier_id()) OR supplier_on_request(id)));

create policy "requests_update" on public.requests for update
  using (is_admin())
  with check (is_admin());

create policy "pricing_insert" on public.supplier_pricing for insert
  with check (is_admin());

create policy "pricing_update" on public.supplier_pricing for update
  using ((is_admin() OR (supplier_id = my_supplier_id())))
  with check ((is_admin() OR (supplier_id = my_supplier_id())));

create policy "public read pricing" on public.supplier_pricing for select
  using (true);

create policy "public read suppliers" on public.suppliers for select
  using (true);

create policy "suppliers_delete" on public.suppliers for delete
  using (is_admin());

create policy "suppliers_insert" on public.suppliers for insert
  with check (is_admin());

create policy "suppliers_update" on public.suppliers for update
  using (is_admin())
  with check (is_admin());

-- ---------- triggers -------------------------------------------------
-- (webhook triggers on public.requests / public.quotes intentionally omitted)
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
