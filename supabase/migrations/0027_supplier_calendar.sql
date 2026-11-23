-- Supplier calendar (phase 3). Builds on 0026 (appointments, held slots).
--
-- A supplier (or an admin, per supplier) can:
--   * see their calendar: upcoming booked / held jobs and their own blocks
--   * block time they aren't available (kind = 'block'): customers can't book it
--     and it can't overlap a booked job
--   * remove a block
--   * move a booked job to another free 2-hour slot (outside the 24-hour notice
--     rule, which only applies to customers)
--   * arrange a time for an after-hours callout (no slot is held when the customer
--     books one; the supplier agrees a time and it goes on the calendar)
--
-- Everything that writes goes through the functions below (the table stays
-- read-only to the browser). The exclusion constraint from 0026 still decides
-- overlaps, so none of these can double-book.
--
-- Idempotent: safe to run more than once.

-- ---------- read access: a supplier's own appointments (admin: all) ----------

grant select on public.appointments to authenticated;

drop policy if exists "appointments_select" on public.appointments;
create policy "appointments_select" on public.appointments for select using (
  public.is_admin()
  or (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id())
);

-- ---------- helpers ----------

-- Is this a 2-hour slot inside the supplier's working hours (and not a day off)?
-- Same rules as _slot_ok (0026) without the customer-only notice / horizon limits.
create or replace function public._slot_in_hours(p_supplier uuid, p_start timestamptz)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  tz       text;
  hrs      jsonb;
  local_ts timestamp;
  d        date;
  h        integer;
  day      jsonb;
begin
  select s.timezone, s.hours into tz, hrs
    from public.supplier_schedule s where s.supplier_id = p_supplier;
  tz  := coalesce(tz, 'Australia/Brisbane');
  hrs := coalesce(hrs, public.default_schedule_hours());

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
  return true;
end;
$$;

revoke all on function public._slot_in_hours(uuid, timestamptz) from public, anon, authenticated;

-- "Tue 15 Dec, 1 pm – 3 pm" in the supplier's time zone.
create or replace function public._time_label(p_start timestamptz, p_end timestamptz, p_tz text)
returns text
language sql stable
as $$
  select to_char(p_start at time zone p_tz, 'Dy FMDD Mon, FMHH12 am')
         || ' – ' || to_char(p_end at time zone p_tz, 'FMHH12 am');
$$;

revoke all on function public._time_label(timestamptz, timestamptz, text) from public, anon, authenticated;

-- The caller must be an admin or the supplier themself.
create or replace function public._may_manage_supplier(p_supplier uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
     and (public.is_admin() or (public.my_supplier_id() is not null and public.my_supplier_id() = p_supplier));
$$;

revoke all on function public._may_manage_supplier(uuid) from public, anon, authenticated;

-- ---------- slots for the supplier's own calendar (no customer notice limits) ----------
-- Copy of available_slots (0026) minus the notice / horizon rules, and only
-- for the supplier or an admin: a supplier may move a job to a slot that is
-- less than 24 hours away.

create or replace function public.supplier_slots(p_supplier_id uuid, p_from date, p_to date)
returns table (slot_start timestamptz, slot_end timestamptz, free boolean)
language plpgsql security definer set search_path = public
as $$
declare
  tz  text;
  hrs jsonb;
  d   date;
  h   integer;
  day jsonb;
  ss  timestamptz;
begin
  if not public._may_manage_supplier(p_supplier_id) then
    raise exception 'not allowed';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'ask for at most 62 days at a time';
  end if;

  update public.appointments set state = 'released'
   where state = 'held' and held_until is not null and held_until < now();

  select s.timezone, s.hours into tz, hrs
    from public.supplier_schedule s where s.supplier_id = p_supplier_id;
  tz  := coalesce(tz, 'Australia/Brisbane');
  hrs := coalesce(hrs, public.default_schedule_hours());

  for d in select g::date from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g loop
    day := hrs -> (extract(isodow from d)::integer - 1);
    continue when not (day ->> 'on')::boolean;
    continue when exists (select 1 from public.supplier_days_off o where o.supplier_id = p_supplier_id and o.day = d);
    h := (day ->> 'start')::integer;
    while h + 2 <= (day ->> 'end')::integer loop
      ss := (d + make_interval(hours => h)) at time zone tz;
      if ss > now() then
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

revoke all on function public.supplier_slots(uuid, date, date) from public, anon;
grant execute on function public.supplier_slots(uuid, date, date) to authenticated;

-- ---------- block time ----------

create or replace function public.block_time(
  p_supplier_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_note text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public._may_manage_supplier(p_supplier_id) then
    raise exception 'not allowed';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'the end must be after the start';
  end if;
  if p_ends_at - p_starts_at > interval '14 days' then
    raise exception 'block at most 14 days at a time';
  end if;
  if length(coalesce(p_note, '')) > 200 then
    raise exception 'keep the note under 200 characters';
  end if;

  update public.appointments set state = 'released'
   where state = 'held' and held_until is not null and held_until < now();

  begin
    insert into public.appointments (supplier_id, kind, starts_at, ends_at, state, note)
    values (p_supplier_id, 'block', p_starts_at, p_ends_at, 'confirmed', nullif(trim(coalesce(p_note, '')), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'that overlaps a booked job or another block - move or remove it first';
  end;
  return v_id;
end;
$$;

create or replace function public.release_block(p_appointment_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = p_appointment_id and kind = 'block';
  if a.id is null or not public._may_manage_supplier(a.supplier_id) then
    raise exception 'not allowed';
  end if;
  update public.appointments set state = 'released' where id = a.id and state <> 'released';
end;
$$;

-- ---------- move a booked job ----------

create or replace function public.move_booking(p_request_id text, p_new_start timestamptz)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r      public.requests;
  a      public.appointments;
  tz     text;
  v_note text;
begin
  select * into r from public.requests where id = p_request_id;
  if r.id is null or r.selected_supplier_id is null or not public._may_manage_supplier(r.selected_supplier_id) then
    raise exception 'not allowed';
  end if;

  select * into a from public.appointments
   where request_id = p_request_id and kind = 'job' and state in ('held', 'confirmed')
   order by created_at desc limit 1;
  if a.id is null then
    raise exception 'this booking has no time to move';
  end if;
  if p_new_start is null or p_new_start <= now() then
    raise exception 'pick a time in the future';
  end if;
  if not public._slot_in_hours(r.selected_supplier_id, p_new_start) then
    raise exception 'that is not one of your open 2-hour slots';
  end if;

  select coalesce(s.timezone, 'Australia/Brisbane') into tz
    from public.supplier_schedule s where s.supplier_id = r.selected_supplier_id;
  tz := coalesce(tz, 'Australia/Brisbane');
  -- keep whatever the customer typed after the time ("... — ring me first")
  v_note := substring(r.preferred_time from ' — (.*)$');

  update public.appointments set state = 'released'
   where state = 'held' and held_until is not null and held_until < now();

  begin
    update public.appointments
       set starts_at = p_new_start, ends_at = p_new_start + interval '2 hours'
     where id = a.id;
  exception when exclusion_violation then
    raise exception 'that time is already taken';
  end;

  update public.requests
     set scheduled_start = p_new_start,
         scheduled_end   = p_new_start + interval '2 hours',
         preferred_time  = public._time_label(p_new_start, p_new_start + interval '2 hours', tz)
                           || coalesce(' — ' || v_note, '')
   where id = p_request_id;
end;
$$;

-- ---------- arrange an after-hours callout ----------

create or replace function public.arrange_time(p_request_id text, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r      public.requests;
  tz     text;
  v_note text;
begin
  select * into r from public.requests where id = p_request_id;
  if r.id is null or r.selected_supplier_id is null or not public._may_manage_supplier(r.selected_supplier_id) then
    raise exception 'not allowed';
  end if;
  if r.request_type is distinct from 'booking' or not coalesce(r.after_hours, false) then
    raise exception 'only after-hours callouts need a time arranged';
  end if;
  if not exists (
    select 1 from public.quotes q
     where q.request_id = p_request_id and q.supplier_id = r.selected_supplier_id
       and q.status not in ('rejected', 'declined')
  ) then
    raise exception 'this booking has been declined';
  end if;
  if exists (
    select 1 from public.appointments a
     where a.request_id = p_request_id and a.kind = 'job' and a.state in ('held', 'confirmed')
  ) then
    raise exception 'a time is already arranged - move it instead';
  end if;
  if p_start is null or p_end is null or p_end <= p_start
     or p_end - p_start < interval '1 hour' or p_end - p_start > interval '12 hours' then
    raise exception 'a visit is between 1 and 12 hours';
  end if;
  if p_start <= now() then
    raise exception 'pick a time in the future';
  end if;

  select coalesce(s.timezone, 'Australia/Brisbane') into tz
    from public.supplier_schedule s where s.supplier_id = r.selected_supplier_id;
  tz := coalesce(tz, 'Australia/Brisbane');
  v_note := substring(r.preferred_time from ' — (.*)$');

  update public.appointments set state = 'released'
   where state = 'held' and held_until is not null and held_until < now();

  begin
    insert into public.appointments (supplier_id, request_id, kind, starts_at, ends_at, state)
    values (r.selected_supplier_id, p_request_id, 'job', p_start, p_end, 'confirmed');
  exception when exclusion_violation then
    raise exception 'that overlaps a booked job or a block';
  end;

  update public.requests
     set scheduled_start = p_start,
         scheduled_end   = p_end,
         preferred_time  = 'After-hours callout: ' || public._time_label(p_start, p_end, tz)
                           || coalesce(' — ' || v_note, '')
   where id = p_request_id;
end;
$$;

revoke all on function public.block_time(uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.release_block(uuid) from public, anon;
revoke all on function public.move_booking(text, timestamptz) from public, anon;
revoke all on function public.arrange_time(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.block_time(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.release_block(uuid) to authenticated;
grant execute on function public.move_booking(text, timestamptz) to authenticated;
grant execute on function public.arrange_time(text, timestamptz, timestamptz) to authenticated;
