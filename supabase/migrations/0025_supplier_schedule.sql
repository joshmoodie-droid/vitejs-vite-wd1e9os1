-- Supplier schedule (booking availability), phase 1.
--
-- Each supplier says which days and hours they take field service jobs, which
-- individual days they are off, and a few booking rules. Phase 2 uses this to
-- offer customers 2-hour slots; phase 1 only lets suppliers (and admins)
-- record it. Outside these hours a job is an "after-hours callout", which
-- carries an extra fee set in Pricing (supplier_pricing.after_hours_fee).
--
-- hours is a JSON array of 7 days, Monday first (index 0 = Monday):
--   [{"on": true, "start": 7, "end": 17}, ...]   (whole hours, 24-hour clock)
-- A day that is off keeps its start/end so they are remembered if switched on.
-- Slots are 2 hours long, so a day has floor((end - start) / 2) slots.
--
-- Writes go through save_supplier_schedule() only: clients get SELECT (their
-- own supplier's rows, or everything for an admin) and nothing else, so a
-- direct write is refused by the grants rather than silently filtered.
-- Customers never read these tables; phase 2 adds a function that reveals only
-- free slots.
--
-- Idempotent: safe to run more than once.

-- ---------- after-hours fee ----------

alter table public.supplier_pricing
  add column if not exists after_hours_fee numeric not null default 150 check (after_hours_fee >= 0);

-- ---------- helpers ----------

create or replace function public.default_schedule_hours()
returns jsonb
language sql immutable
as $$
  select '[
    {"on": true,  "start": 7, "end": 17},
    {"on": true,  "start": 7, "end": 17},
    {"on": true,  "start": 7, "end": 17},
    {"on": true,  "start": 7, "end": 17},
    {"on": true,  "start": 7, "end": 16},
    {"on": false, "start": 8, "end": 12},
    {"on": false, "start": 8, "end": 12}
  ]'::jsonb;
$$;

-- Seven objects, each with a boolean "on" and whole-number "start"/"end" where
-- 0 <= start, end <= 24 and the day is at least one 2-hour slot long.
create or replace function public._schedule_hours_ok(h jsonb)
returns boolean
language plpgsql immutable
as $$
declare
  i int;
  d jsonb;
  s numeric;
  e numeric;
begin
  if h is null or jsonb_typeof(h) <> 'array' or jsonb_array_length(h) <> 7 then
    return false;
  end if;
  for i in 0..6 loop
    d := h -> i;
    if jsonb_typeof(d) <> 'object'
       or jsonb_typeof(d -> 'on') <> 'boolean'
       or jsonb_typeof(d -> 'start') <> 'number'
       or jsonb_typeof(d -> 'end') <> 'number' then
      return false;
    end if;
    s := (d ->> 'start')::numeric;
    e := (d ->> 'end')::numeric;
    if s <> trunc(s) or e <> trunc(e) or s < 0 or e > 24 or e - s < 2 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------- tables ----------

create table if not exists public.supplier_schedule (
  supplier_id        uuid primary key references public.suppliers(id) on delete cascade,
  hours              jsonb not null default public.default_schedule_hours()
                     check (public._schedule_hours_ok(hours)),
  min_notice_hours   integer not null default 24  check (min_notice_hours between 0 and 336),
  max_days_ahead     integer not null default 56  check (max_days_ahead between 1 and 365),
  hold_hours         integer not null default 48  check (hold_hours between 1 and 336),
  timezone           text    not null default 'Australia/Brisbane',
  updated_at         timestamptz not null default now()
);

create table if not exists public.supplier_days_off (
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  day         date not null,
  primary key (supplier_id, day)
);

-- ---------- grants + RLS: read only ----------

revoke all on public.supplier_schedule, public.supplier_days_off from anon, authenticated;
grant select on public.supplier_schedule, public.supplier_days_off to authenticated;

alter table public.supplier_schedule enable row level security;
alter table public.supplier_days_off enable row level security;

drop policy if exists "schedule_select" on public.supplier_schedule;
drop policy if exists "days_off_select" on public.supplier_days_off;

create policy "schedule_select" on public.supplier_schedule for select using (
  public.is_admin()
  or (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id())
);

create policy "days_off_select" on public.supplier_days_off for select using (
  public.is_admin()
  or (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id())
);

-- ---------- save ----------

create or replace function public.save_supplier_schedule(
  p_supplier_id      uuid,
  p_hours            jsonb,
  p_min_notice_hours integer,
  p_max_days_ahead   integer,
  p_hold_hours       integer,
  p_days_off         date[]
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in to change the schedule';
  end if;
  if not (public.is_admin()
          or (public.my_supplier_id() is not null and p_supplier_id = public.my_supplier_id())) then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'unknown supplier';
  end if;
  if not public._schedule_hours_ok(p_hours) then
    raise exception 'invalid working hours';
  end if;
  if coalesce(p_min_notice_hours, -1) not between 0 and 336
     or coalesce(p_max_days_ahead, 0) not between 1 and 365
     or coalesce(p_hold_hours, 0) not between 1 and 336 then
    raise exception 'invalid booking rules';
  end if;
  if coalesce(array_length(p_days_off, 1), 0) > 400 then
    raise exception 'too many days off';
  end if;

  insert into public.supplier_schedule
    (supplier_id, hours, min_notice_hours, max_days_ahead, hold_hours, updated_at)
  values
    (p_supplier_id, p_hours, p_min_notice_hours, p_max_days_ahead, p_hold_hours, now())
  on conflict (supplier_id) do update set
    hours            = excluded.hours,
    min_notice_hours = excluded.min_notice_hours,
    max_days_ahead   = excluded.max_days_ahead,
    hold_hours       = excluded.hold_hours,
    updated_at       = now();

  delete from public.supplier_days_off where supplier_id = p_supplier_id;
  insert into public.supplier_days_off (supplier_id, day)
  select distinct p_supplier_id, d
    from unnest(coalesce(p_days_off, '{}'::date[])) as d
   where d is not null;
end;
$$;

revoke all on function public.save_supplier_schedule(uuid, jsonb, integer, integer, integer, date[]) from public, anon;
grant execute on function public.save_supplier_schedule(uuid, jsonb, integer, integer, integer, date[]) to authenticated;
