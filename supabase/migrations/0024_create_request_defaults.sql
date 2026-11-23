-- Fix: field service bookings were refused by the database.
--
-- Migration 0010 made requests.fulfillment NOT NULL (default 'pickup'). But
-- create_request() builds the row with jsonb_populate_record, which leaves any
-- column the caller didn't send as NULL instead of using the column default,
-- and then inserts that explicit NULL. The quote form always sends
-- fulfillment; the field service booking form never did, so every booking
-- failed with "null value in column fulfillment" (and, before PR #81, the
-- screen said "sent" anyway).
--
-- This re-creates create_request() so that every NOT NULL column that has a
-- default gets that default when the caller left it out — the same treatment
-- 0008 gave access_token and created_at. Nothing else changes (0013 version:
-- own-user check, own-machine check).
--
-- Idempotent: safe to run more than once.

create or replace function public.create_request(r jsonb)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  rec public.requests;
begin
  if (r ->> 'customer_id') is not null
     and (r ->> 'customer_id')::uuid is distinct from auth.uid() then
    raise exception 'cannot create a request for another user';
  end if;

  rec := jsonb_populate_record(null::public.requests, r);
  if rec.machine_id is not null and not public.owns_machine(rec.machine_id) then
    raise exception 'cannot link a request to another customer''s machine';
  end if;

  -- Columns that are NOT NULL with a default: use the default when not sent.
  if rec.request_type is null then rec.request_type := 'quote'; end if;
  if rec.status       is null then rec.status       := 'open'; end if;
  if rec.fulfillment  is null then rec.fulfillment  := 'pickup'; end if;
  if rec.access_token is null then rec.access_token := gen_random_uuid(); end if;
  if rec.created_at   is null then rec.created_at   := now(); end if;

  insert into public.requests values (rec.*) returning * into rec;

  return json_build_object(
    'id', rec.id,
    'access_token', rec.access_token,
    'created_at', rec.created_at
  );
end;
$$;

-- Same grants as before (create or replace keeps them, restated for safety).
revoke all on function public.create_request(jsonb) from public;
grant execute on function public.create_request(jsonb) to anon, authenticated;
