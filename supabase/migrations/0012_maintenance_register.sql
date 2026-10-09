-- M1: maintenance register (docs/IMPLEMENTATION_PLAN.md).
--
-- Signed-in customers keep a register of their machines, the hoses fitted to
-- each one, and a service log (any maintenance, not just hoses).
--
-- Every row carries customer_id directly so the policies are a plain
-- `customer_id = auth.uid()` with no cross-table helper functions. Child rows
-- must also point at a machine the caller owns, so nobody can attach a hose or
-- log entry to someone else's machine by guessing its id.
--
-- anon gets no grants at all on these tables (customer-only feature, sign-in
-- required); admins can read everything for support.
--
-- Idempotent: safe to run more than once.

-- ---------- machines ----------

create table if not exists public.machines (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  make        text,
  model       text,
  year        int check (year between 1900 and 2100),
  serial      text,
  rego        text,
  hours       numeric check (hours >= 0),
  site        text,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists machines_customer_id_idx on public.machines (customer_id);

-- ---------- machine_hoses (the hose register) ----------

create table if not exists public.machine_hoses (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  machine_id   uuid not null references public.machines(id) on delete cascade,
  position     text not null check (length(trim(position)) > 0),
  -- Same shape as one entry of requests.assemblies (category, hoseType, bore,
  -- length, pressure, fittingA/B type + orientation) so "Order again" can
  -- drop it straight into the quote form.
  spec         jsonb not null default '{}'::jsonb,
  installed_at date,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  request_id   text references public.requests(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists machine_hoses_machine_id_idx on public.machine_hoses (machine_id);
create index if not exists machine_hoses_customer_id_idx on public.machine_hoses (customer_id);

-- ---------- service_log ----------

create table if not exists public.service_log (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  machine_id   uuid not null references public.machines(id) on delete cascade,
  kind         text not null default 'other' check (kind in (
                 'hose_replaced', 'inspection', 'service', 'oil_filter',
                 'grease', 'repair', 'other')),
  performed_at date not null default current_date,
  hours        numeric check (hours >= 0),
  cost         numeric check (cost >= 0),
  performed_by text,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  request_id   text references public.requests(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists service_log_machine_id_idx on public.service_log (machine_id, performed_at desc);
create index if not exists service_log_customer_id_idx on public.service_log (customer_id);

-- ---------- grants: signed-in users only ----------

revoke all on public.machines, public.machine_hoses, public.service_log from anon;
grant select, insert, update, delete
  on public.machines, public.machine_hoses, public.service_log to authenticated;

-- ---------- RLS ----------

alter table public.machines      enable row level security;
alter table public.machine_hoses enable row level security;
alter table public.service_log   enable row level security;

-- machines
drop policy if exists "machines_select" on public.machines;
drop policy if exists "machines_insert" on public.machines;
drop policy if exists "machines_update" on public.machines;
drop policy if exists "machines_delete" on public.machines;

create policy "machines_select" on public.machines for select
  using (customer_id = auth.uid() or public.is_admin());
create policy "machines_insert" on public.machines for insert
  with check (customer_id = auth.uid());
create policy "machines_update" on public.machines for update
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "machines_delete" on public.machines for delete
  using (customer_id = auth.uid());

-- machine_hoses (the machine must be the caller's too)
drop policy if exists "machine_hoses_select" on public.machine_hoses;
drop policy if exists "machine_hoses_insert" on public.machine_hoses;
drop policy if exists "machine_hoses_update" on public.machine_hoses;
drop policy if exists "machine_hoses_delete" on public.machine_hoses;

create policy "machine_hoses_select" on public.machine_hoses for select
  using (customer_id = auth.uid() or public.is_admin());
create policy "machine_hoses_insert" on public.machine_hoses for insert
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.machines m where m.id = machine_id and m.customer_id = auth.uid())
  );
create policy "machine_hoses_update" on public.machine_hoses for update
  using (customer_id = auth.uid())
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.machines m where m.id = machine_id and m.customer_id = auth.uid())
  );
create policy "machine_hoses_delete" on public.machine_hoses for delete
  using (customer_id = auth.uid());

-- service_log (the machine must be the caller's too)
drop policy if exists "service_log_select" on public.service_log;
drop policy if exists "service_log_insert" on public.service_log;
drop policy if exists "service_log_update" on public.service_log;
drop policy if exists "service_log_delete" on public.service_log;

create policy "service_log_select" on public.service_log for select
  using (customer_id = auth.uid() or public.is_admin());
create policy "service_log_insert" on public.service_log for insert
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.machines m where m.id = machine_id and m.customer_id = auth.uid())
  );
create policy "service_log_update" on public.service_log for update
  using (customer_id = auth.uid())
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.machines m where m.id = machine_id and m.customer_id = auth.uid())
  );
create policy "service_log_delete" on public.service_log for delete
  using (customer_id = auth.uid());
