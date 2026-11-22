-- Customer-side on-site service, from the quote page.
--
-- After a supplier confirms a quote the customer can ask for on-site
-- installation, and later confirm the supplier's on-site pricing. Both were
-- written straight to quotes.field_service from the browser, but the quotes
-- UPDATE policy only allows an admin or the quote's own supplier, so the
-- database silently refused them (zero rows, no error) while the screen
-- showed success and the supplier never saw the request.
--
-- These SECURITY DEFINER functions make exactly those two changes after
-- checking the request's access_token, the same way accept_quote_by_token
-- does. Nothing about the policies changes.

create or replace function public.request_field_service_by_token(
  p_request_id   text,
  p_token        uuid,
  p_quote_id     text,
  p_site_address text,
  p_access_notes text,
  p_labour_hours text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  q  public.quotes%rowtype;
  pr public.supplier_pricing%rowtype;
  fs jsonb;
begin
  if not exists (
    select 1 from public.requests
    where id = p_request_id and access_token = p_token
  ) then
    raise exception 'invalid request or token';
  end if;

  select * into q from public.quotes
   where id = p_quote_id and request_id = p_request_id;
  if not found then
    raise exception 'quote not found';
  end if;
  if coalesce(q.is_booking, false) then
    raise exception 'on-site service does not apply to bookings';
  end if;
  if q.status not in ('confirmed', 'accepted') then
    raise exception 'this quote is not open for on-site service';
  end if;
  if (q.field_service ->> 'requested') = 'true' then
    raise exception 'on-site service has already been requested';
  end if;
  if coalesce(trim(p_site_address), '') = '' then
    raise exception 'a site address is required';
  end if;

  -- Seed the callout and travel charges from the supplier's own rates; the
  -- supplier reviews and finalises them before the customer sees a price.
  select * into pr from public.supplier_pricing where supplier_id = q.supplier_id;

  fs := jsonb_build_object(
    'requested', true,
    'status', 'pending',
    'siteAddress', trim(p_site_address),
    'accessNotes', coalesce(p_access_notes, ''),
    'calloutFee', coalesce(pr.callout_fee, 65),
    'travelCharge', coalesce(pr.travel_base, 45),
    'customerLabourHours', nullif(trim(coalesce(p_labour_hours, '')), ''),
    'labour', 0,
    'labourHours', null,
    'hourlyRate', null
  );

  update public.quotes set field_service = fs where id = q.id;
  return fs;
end;
$$;

create or replace function public.confirm_field_service_by_token(
  p_request_id text,
  p_token      uuid,
  p_quote_id   text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  q  public.quotes%rowtype;
  fs jsonb;
begin
  if not exists (
    select 1 from public.requests
    where id = p_request_id and access_token = p_token
  ) then
    raise exception 'invalid request or token';
  end if;

  select * into q from public.quotes
   where id = p_quote_id and request_id = p_request_id;
  if not found then
    raise exception 'quote not found';
  end if;
  if q.status not in ('confirmed', 'accepted') then
    raise exception 'this quote is not open for on-site service';
  end if;
  if (q.field_service ->> 'status') is distinct from 'quoted' then
    raise exception 'there is no on-site pricing waiting for confirmation';
  end if;

  fs := jsonb_set(q.field_service, '{status}', '"confirmed"');
  update public.quotes set field_service = fs where id = q.id;
  return fs;
end;
$$;

grant execute on function public.request_field_service_by_token(text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.confirm_field_service_by_token(text, uuid, text)                    to anon, authenticated;
