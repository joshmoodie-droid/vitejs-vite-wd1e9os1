-- M6: commission tracking (docs/IMPLEMENTATION_PLAN.md, ROADMAP §3 Option A).
--
-- HoseQuote's fee on each job a customer accepts: the supplier's rate × the
-- job value, clamped to a minimum and maximum (default 8%, min $5, max $50,
-- never more than the job itself). Invoiced monthly by the admin from the
-- Commission tab; nothing is charged automatically.
--
-- Kept in their own tables, readable only by an admin and the supplier
-- concerned — suppliers and quotes are visible to customers (and supplier
-- rows to everyone, for the supplier picker), commission isn't.
--
-- * supplier_commission — a supplier's rate / min / max, set by the admin.
--   No row = the defaults. Rate 0 = no fee (e.g. a Pro tier).
-- * commissions — one row per job (quote accepted or completed), kept in
--   step with the quote by trigger: job value follows the final price, the
--   rate is the supplier's when the job was accepted. The admin can change a
--   job's rate (0 = waive) and mark it invoiced; once invoiced it's frozen.
-- * Jobs accepted before this migration are recorded at rate 0 — they were
--   free, so they never show a fee.
--
-- Job value = the quoted price (midpoint of a low–high range) plus on-site
-- costs priced in field_service — the total the customer accepted.
--
-- Idempotent: safe to run more than once.

-- ---------- tables ----------

create table if not exists public.supplier_commission (
  supplier_id uuid primary key references public.suppliers(id) on delete cascade,
  rate        numeric not null default 0.08 check (rate >= 0 and rate <= 1),
  min_fee     numeric not null default 5    check (min_fee >= 0),
  max_fee     numeric not null default 50   check (max_fee >= min_fee),
  updated_at  timestamptz not null default now()
);

create table if not exists public.commissions (
  quote_id     text primary key references public.quotes(id) on delete cascade,
  supplier_id  uuid not null references public.suppliers(id) on delete cascade,
  request_id   text not null,
  status       text not null check (status in ('accepted', 'completed')),
  accepted_at  timestamptz not null default now(),
  completed_at timestamptz,
  job_value    numeric not null default 0,
  rate         numeric not null check (rate >= 0 and rate <= 1),
  amount       numeric not null default 0,
  invoiced_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists commissions_supplier_idx  on public.commissions (supplier_id);
create index if not exists commissions_completed_idx on public.commissions (completed_at);

-- ---------- helpers ----------

-- 0020 adds try_numeric(); repeated so this migration stands on its own.
create or replace function public.try_numeric(p text)
returns numeric
language plpgsql immutable
as $$
begin
  return p::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.quote_job_value(p_low numeric, p_high numeric, p_fs jsonb)
returns numeric
language sql immutable
as $$
  select round(
    (coalesce(p_low, p_high, 0) + coalesce(p_high, p_low, 0)) / 2
    + case
        when lower(coalesce(p_fs ->> 'requested', '')) = 'true'
             and p_fs ->> 'status' in ('quoted', 'confirmed')
        then coalesce(public.try_numeric(p_fs ->> 'calloutFee'), 0)
           + coalesce(public.try_numeric(p_fs ->> 'travelCharge'), 0)
           + coalesce(public.try_numeric(p_fs ->> 'labour'), 0)
        else 0
      end, 2);
$$;

-- rate × value, within [min, max], never more than the job.
create or replace function public.commission_for(p_value numeric, p_rate numeric, p_supplier uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select case
    when coalesce(p_value, 0) <= 0 or coalesce(p_rate, 0) <= 0 then 0
    else round(least(p_value, coalesce(sc.max_fee, 50), greatest(coalesce(sc.min_fee, 5), p_value * p_rate)), 2)
  end
  from (select 1) one
  left join public.supplier_commission sc on sc.supplier_id = p_supplier;
$$;

-- Internal (reads every supplier's min/max): triggers only.
revoke all on function public.commission_for(numeric, numeric, uuid) from public, anon, authenticated;

-- ---------- quotes -> commissions ----------

create or replace function public.sync_commission()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c       public.commissions;
  v_value numeric;
  v_rate  numeric;
begin
  select * into c from public.commissions where quote_id = new.id;
  if c.invoiced_at is not null then return new; end if;  -- invoiced: frozen

  if new.status not in ('accepted', 'completed') then
    -- not a job (any more), e.g. reopened or withdrawn: nothing owed
    if c.quote_id is not null then delete from public.commissions where quote_id = new.id; end if;
    return new;
  end if;

  v_value := public.quote_job_value(new.price_low, new.price_high, new.field_service);
  if c.quote_id is null then
    select coalesce((select rate from public.supplier_commission where supplier_id = new.supplier_id), 0.08)
      into v_rate;
    insert into public.commissions (quote_id, supplier_id, request_id, status, completed_at, job_value, rate, amount)
    values (new.id, new.supplier_id, new.request_id, new.status, new.completed_at, v_value, v_rate,
            public.commission_for(v_value, v_rate, new.supplier_id));
  else
    update public.commissions
       set status = new.status, completed_at = new.completed_at, job_value = v_value,
           amount = public.commission_for(v_value, c.rate, new.supplier_id)
     where quote_id = new.id;
  end if;
  return new;
exception when others then
  -- Bookkeeping must never block accepting or completing a job.
  raise warning 'sync_commission(%): %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.sync_commission() from public, anon, authenticated;

-- Admin edits a job's rate (0 = waive): the amount follows. Invoiced rows
-- keep their figures.
create or replace function public.commissions_recalc()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.invoiced_at is not null and new.invoiced_at is not null then
    new.rate := old.rate;
    new.amount := old.amount;
    new.job_value := old.job_value;
  elsif new.rate is distinct from old.rate or new.job_value is distinct from old.job_value then
    new.amount := public.commission_for(new.job_value, new.rate, new.supplier_id);
  end if;
  return new;
end;
$$;

revoke all on function public.commissions_recalc() from public, anon, authenticated;

drop trigger if exists commissions_recalc on public.commissions;
create trigger commissions_recalc
  before update on public.commissions
  for each row execute function public.commissions_recalc();

-- ---------- backfill: jobs before commission started were free ----------

insert into public.commissions (quote_id, supplier_id, request_id, status, accepted_at, completed_at, job_value, rate, amount)
select q.id, q.supplier_id, q.request_id, q.status, coalesce(q.completed_at, q.created_at, now()), q.completed_at,
       public.quote_job_value(q.price_low, q.price_high, q.field_service), 0, 0
  from public.quotes q
 where q.status in ('accepted', 'completed')
on conflict (quote_id) do nothing;

drop trigger if exists quotes_sync_commission on public.quotes;
create trigger quotes_sync_commission
  after insert or update on public.quotes
  for each row execute function public.sync_commission();

-- ---------- RLS ----------

alter table public.supplier_commission enable row level security;
alter table public.commissions         enable row level security;

revoke all on public.supplier_commission from anon;
revoke all on public.commissions         from anon;
grant select, insert, update, delete on public.supplier_commission to authenticated;
grant select, update                 on public.commissions         to authenticated;

drop policy if exists "supplier_commission_select" on public.supplier_commission;
create policy "supplier_commission_select" on public.supplier_commission for select
  using (public.is_admin() or supplier_id = public.my_supplier_id());
drop policy if exists "supplier_commission_admin_write" on public.supplier_commission;
create policy "supplier_commission_admin_write" on public.supplier_commission for all
  using (public.is_admin()) with check (public.is_admin());

-- Rows are written by the trigger; the admin changes rate / invoiced_at.
drop policy if exists "commissions_select" on public.commissions;
create policy "commissions_select" on public.commissions for select
  using (public.is_admin() or supplier_id = public.my_supplier_id());
drop policy if exists "commissions_admin_update" on public.commissions;
create policy "commissions_admin_update" on public.commissions for update
  using (public.is_admin()) with check (public.is_admin());
