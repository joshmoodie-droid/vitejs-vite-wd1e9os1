-- Phase 3b: move the anonymous / cross-actor read & write paths onto
-- security-definer RPCs so Phase 3c can lock the base tables without
-- breaking the /r/:id link flow or the customer submit flow.
--
-- These run as the function owner (bypass RLS). Callers pass the request's
-- access_token as the authorisation check where there is no JWT.

-- ---------- read a request + its non-declined quotes by link token ----------
create or replace function public.get_request_by_token(p_request_id text, p_token uuid)
returns json
language sql stable security definer set search_path = public
as $$
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
$$;

-- ---------- accept a quote by link token ----------
create or replace function public.accept_quote_by_token(p_request_id text, p_token uuid, p_quote_id text)
returns void
language plpgsql security definer set search_path = public
as $$
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
$$;

-- ---------- insert the indicative auto-quote on customer submit ----------
create or replace function public.create_auto_quote(q jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
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
$$;

-- ---------- link a signed-in customer's past anonymous requests ----------
create or replace function public.claim_my_requests()
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  update public.requests
     set customer_id = auth.uid()
   where customer_id is null
     and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.get_request_by_token(text, uuid)        to anon, authenticated;
grant execute on function public.accept_quote_by_token(text, uuid, text) to anon, authenticated;
grant execute on function public.create_auto_quote(jsonb)               to anon, authenticated;
grant execute on function public.claim_my_requests()                    to authenticated;
