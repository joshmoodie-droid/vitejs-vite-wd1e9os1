-- Booking slots (phase 2): customers pick a 2-hour slot inside the supplier's
-- working hours (0025), the time is HELD for them straight away, and the
-- supplier confirms it by confirming the quote. Outside working hours the job
-- is an after-hours callout: no slot is held, the supplier arranges the time,
-- and the supplier's after-hours fee (supplier_pricing.after_hours_fee) is
-- added to the price as its own line (quotes.after_hours_charge).
--
-- Double-booking is impossible by construction: appointments carries an
-- exclusion constraint, so two active holds for the same supplier can't overlap
-- even if two customers press Send at the same instant (the loser's whole
-- booking is rolled back and they are asked to pick another time).
--
-- Holds: 'held' (waiting for the supplier) -> 'confirmed' (the quote is
-- confirmed / accepted) -> 'done' (job completed); or 'released' (the supplier
-- rejects it, another supplier is chosen, or the hold lapses). A hold lapses
-- supplier_schedule.hold_hours after it was made; lapsed holds are released
-- whenever slots are asked for or a booking is made, so no background job is
-- needed.
--
-- Customers (even signed-out) can only ask which slots are free
-- (available_slots) and book one (create_booking); they never see anyone's
-- booking. The appointments table itself is private.
--
-- All times are stored as timestamptz and interpreted in the supplier's time
-- zone (supplier_schedule.timezone, Queensland by default).
--
-- Idempotent: safe to run more than once.

create extension if not exists btree_gist with schema extensions;

-- ---------- request / quote columns ----------

-- Nullable on purpose: create_request() uses jsonb_populate_record, which leaves
-- columns the caller didn't send as NULL (see 0024). Treat NULL as "no".
alter table public.requests
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end   timestamptz,
  add column if not exists after_hours     boolean;

alter table public.quotes
  add column if not exists after_hours_charge numeric check (after_hours_charge >= 0);

-- ---------- appointments ----------

create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  request_id  text references public.requests(id) on delete cascade,
  kind        text not null default 'job' check (kind in ('job', 'block')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  state       text not null default 'held' check (state in ('held', 'confirmed', 'released', 'done')),
  held_until  timestamptz,
  note        text,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (supplier_id with =, tstzrange(starts_at, ends_at) with &&)
      where (state in ('held', 'confirmed'));
  end if;
end $$;

create index if not exists appointments_request_idx on public.appointments (request_id);
create index if not exists appointments_supplier_time_idx on public.appointments (supplier_id, starts_at);

revoke all on public.appointments from anon, authenticated;
alter table public.appointments enable row level security;
-- No policies: nobody reads or writes this table directly. (A supplier calendar
-- view in phase 3 gets its own read access.)

-- ---------- is this a real, bookable slot? ----------

create or replace function public._slot_ok(p_supplier uuid, p_start timestamptz)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  tz       text;
  hrs      jsonb;
  notice   integer;
  horizon  integer;
  local_ts timestamp;
  d        date;
  h        integer;
  day      jsonb;
begin
  select s.timezone, s.hours, s.min_notice_hours, s.max_days_ahead
    into tz, hrs, notice, horizon
    from public.supplier_schedule s where s.supplier_id = p_supplier;
  tz      := coalesce(tz, 'Australia/Brisbane');
  hrs     := coalesce(hrs, public.default_schedule_hours());
  notice  := coalesce(notice, 24);
  horizon := coalesce(horizon, 56);

  local_ts := p_start at time zone tz;
  if date_trunc('hour', local_ts) <> local_ts then return false; end if;
  d := local_ts::date;
  h := extract(hour from local_ts)::integer;

  day := hrs -> (extract(isodow from d)::integer - 1);
  if not (day ->> 'on')::boolean then return false; end if;
  if h < (day ->> 'start')::integer
     or h + 2 > (day ->> 'end')::integer
     or (h - (day ->> 'start')::integer) % 2 <> 0 then
    return false;
  end if;

  if exists (select 1 from public.supplier_days_off o where o.supplier_id = p_supplier and o.day = d) then
    return false;
  end if;
  if p_start < now() + make_interval(hours => notice) then return false; end if;
  if d > (now() at time zone tz)::date + horizon then return false; end if;
  return true;
end;
$$;

revoke all on function public._slot_ok(uuid, timestamptz) from public, anon, authenticated;

-- ---------- which slots exist, and which are free ----------

create or replace function public.available_slots(p_supplier_id uuid, p_from date, p_to date)
returns table (slot_start timestamptz, slot_end timestamptz, free boolean)
language plpgsql security definer set search_path = public
as $$
declare
  tz       text;
  hrs      jsonb;
  notice   integer;
  horizon  integer;
  d        date;
  h        integer;
  day      jsonb;
  ss       timestamptz;
  today    date;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'ask for at most 62 days at a time';
  end if;

  -- release holds nobody confirmed in time
  update public.appointments set state = 'released'
   where state = 'held' and held_until is not null and held_until < now();

  select s.timezone, s.hours, s.min_notice_hours, s.max_days_ahead
    into tz, hrs, notice, horizon
    from public.supplier_schedule s where s.supplier_id = p_supplier_id;
  tz      := coalesce(tz, 'Australia/Brisbane');
  hrs     := coalesce(hrs, public.default_schedule_hours());
  notice  := coalesce(notice, 24);
  horizon := coalesce(horizon, 56);
  today   := (now() at time zone tz)::date;

  for d in select g::date from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g loop
    day := hrs -> (extract(isodow from d)::integer - 1);
    continue when not (day ->> 'on')::boolean;
    continue when d > today + horizon;
    continue when exists (select 1 from public.supplier_days_off o where o.supplier_id = p_supplier_id and o.day = d);
    h := (day ->> 'start')::integer;
    while h + 2 <= (day ->> 'end')::integer loop
      ss := (d + make_interval(hours => h)) at time zone tz;
      if ss >= now() + make_interval(hours => notice) then
        slot_start := ss;
        slot_end   := ss + interval '2 hours';
        free := not exists (
          select 1 from public.appointments a
           where a.supplier_id = p_supplier_id
             and a.state in ('held', 'confirmed')
             and tstzrange(a.starts_at, a.ends_at) && tstzrange(ss, ss + interval '2 hours'));
        return next;
      end if;
      h := h + 2;
    end loop;
  end loop;
end;
$$;

revoke all on function public.available_slots(uuid, date, date) from public;
grant execute on function public.available_slots(uuid, date, date) to anon, authenticated;

-- ---------- create_request(): scheduled times are set only by create_booking ----------
-- 0024 version plus: a client can't claim a scheduled time without holding it.

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

  rec.scheduled_start := null;
  rec.scheduled_end   := null;

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

revoke all on function public.create_request(jsonb) from public;
grant execute on function public.create_request(jsonb) to anon, authenticated;

-- ---------- book a field service job into a slot ----------
-- Saves the request and holds the slot as one step: if the time was just taken
-- nothing is saved.

create or replace function public.create_booking(r jsonb, p_slot_start timestamptz)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_supplier uuid;
  v_hold     integer;
  res        json;
begin
  if (r ->> 'request_type') is distinct from 'booking' then
    raise exception 'only field service bookings can be scheduled';
  end if;
  v_supplier := (r ->> 'selected_supplier_id')::uuid;
  if v_supplier is null then
    raise exception 'choose a supplier first';
  end if;

  update public.appointments set state = 'released'
   where state = 'held' and held_until is not null and held_until < now();

  if not public._slot_ok(v_supplier, p_slot_start) then
    raise exception 'that time is no longer available';
  end if;

  select s.hold_hours into v_hold from public.supplier_schedule s where s.supplier_id = v_supplier;
  v_hold := coalesce(v_hold, 48);

  begin
    res := public.create_request(r);
    update public.requests
       set scheduled_start = p_slot_start, scheduled_end = p_slot_start + interval '2 hours'
     where id = res ->> 'id';
    insert into public.appointments (supplier_id, request_id, kind, starts_at, ends_at, state, held_until)
    values (v_supplier, res ->> 'id', 'job', p_slot_start, p_slot_start + interval '2 hours',
            'held', now() + make_interval(hours => v_hold));
  exception when exclusion_violation then
    raise exception 'that time is no longer available';
  end;

  return res;
end;
$$;

revoke all on function public.create_booking(jsonb, timestamptz) from public;
grant execute on function public.create_booking(jsonb, timestamptz) to anon, authenticated;

-- ---------- the quote decides what happens to the held slot ----------

create or replace function public._sync_appointment_with_quote()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status in ('confirmed', 'accepted') then
    -- a hold that already lapsed is taken back if the time is still free
    begin
      update public.appointments set state = 'confirmed', held_until = null
       where request_id = new.request_id and supplier_id = new.supplier_id
         and kind = 'job' and state in ('held', 'released');
    exception when exclusion_violation then
      null;
    end;
  elsif new.status in ('rejected', 'declined') then
    update public.appointments set state = 'released'
     where request_id = new.request_id and supplier_id = new.supplier_id
       and kind = 'job' and state in ('held', 'confirmed');
  elsif new.status = 'completed' then
    update public.appointments set state = 'done'
     where request_id = new.request_id and supplier_id = new.supplier_id
       and kind = 'job' and state in ('held', 'confirmed');
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_sync_appointment on public.quotes;
create trigger quotes_sync_appointment
  after update of status on public.quotes
  for each row execute function public._sync_appointment_with_quote();

-- ---------- the customer's /r/:id page: also return the time and after-hours fee ----------
-- 0019 version plus preferred_time, scheduled_start/end, after_hours and
-- the quote's after_hours_charge.

create or replace function public.get_request_by_token(p_request_id text, p_token uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'request', json_build_object(
      'id', r.id, 'request_type', r.request_type, 'status', r.status,
      'location', r.location, 'created_at', r.created_at,
      'notes', r.notes, 'assemblies', r.assemblies,
      'field_service_requested', r.field_service_requested,
      'fulfillment', r.fulfillment, 'delivery_address', r.delivery_address,
      'from_audit', r.audit_id is not null,
      'preferred_time', r.preferred_time,
      'scheduled_start', r.scheduled_start, 'scheduled_end', r.scheduled_end,
      'after_hours', coalesce(r.after_hours, false)),
    'quotes', coalesce((
      select json_agg(json_build_object(
        'id', q.id, 'status', q.status, 'price_low', q.price_low, 'price_high', q.price_high,
        'lead_time_days', q.lead_time_days, 'supplier_id', q.supplier_id, 'field_service', q.field_service,
        'after_hours_charge', q.after_hours_charge
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
