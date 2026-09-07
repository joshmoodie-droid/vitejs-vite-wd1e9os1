-- Phase 3c follow-up: the customer submit path.
--
-- 0006 locked requests SELECT to admin / owner / involved-supplier. The client
-- submit did `insert(row).select().single()` — and Postgres requires an
-- INSERT ... RETURNING row to also pass the SELECT policy, so for an anonymous
-- (or not-yet-linked) customer the whole insert rolled back with 42501.
--
-- Fix: route the insert through a SECURITY DEFINER RPC (same shape as
-- create_auto_quote / accept_quote_by_token) that returns just the fields the
-- client needs back, and drop the direct-insert policy entirely.

create or replace function public.create_request(r jsonb)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  rec public.requests;
begin
  -- may not stamp a request with someone else's customer_id
  if (r ->> 'customer_id') is not null
     and (r ->> 'customer_id')::uuid is distinct from auth.uid() then
    raise exception 'cannot create a request for another user';
  end if;

  insert into public.requests
  select * from jsonb_populate_record(null::public.requests, r)
  returning * into rec;

  return json_build_object(
    'id', rec.id,
    'access_token', rec.access_token,
    'created_at', rec.created_at
  );
end;
$$;

grant execute on function public.create_request(jsonb) to anon, authenticated;

-- all request inserts now go through create_request(); no direct client insert.
drop policy if exists "requests_insert" on public.requests;
