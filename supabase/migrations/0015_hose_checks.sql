-- M4a: customer photo hose checks (docs/IMPLEMENTATION_PLAN.md).
--
-- A hose check is one look at one hose on one of the customer's machines:
-- a condition rating, optional notes, and optional photos (storage paths in
-- the private `photos` bucket, in the customer's own folder — see 0014).
-- Checks build a per-hose photo timeline, and a worn hose can be turned into
-- a quote request (request_id links the check to it).
--
-- Same ownership model as service_log (0012): customer_id defaults to
-- auth.uid(); RLS keeps every customer to their own rows; the machine must be
-- theirs; anon has no access. Admins can read for support.
--
-- Idempotent: safe to run more than once.

create table if not exists public.hose_checks (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  machine_id      uuid not null references public.machines(id) on delete cascade,
  -- null = a hose that isn't in the register yet (described in notes)
  machine_hose_id uuid references public.machine_hoses(id) on delete cascade,
  checked_at      timestamptz not null default now(),
  condition       text not null check (condition in ('ok', 'watch', 'replace_soon', 'leaking')),
  notes           text,
  photos          jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  request_id      text references public.requests(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists hose_checks_hose_idx on public.hose_checks (machine_hose_id, checked_at desc);
create index if not exists hose_checks_machine_idx on public.hose_checks (machine_id, checked_at desc);
create index if not exists hose_checks_customer_idx on public.hose_checks (customer_id);

revoke all on public.hose_checks from anon;
grant select, insert, update, delete on public.hose_checks to authenticated;

alter table public.hose_checks enable row level security;

drop policy if exists "hose_checks_select" on public.hose_checks;
drop policy if exists "hose_checks_insert" on public.hose_checks;
drop policy if exists "hose_checks_update" on public.hose_checks;
drop policy if exists "hose_checks_delete" on public.hose_checks;

create policy "hose_checks_select" on public.hose_checks for select
  using (customer_id = auth.uid() or public.is_admin());

-- The machine must be the caller's, and so must the hose (if one is given)
-- and it must sit on that machine.
create policy "hose_checks_insert" on public.hose_checks for insert
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.machines m where m.id = machine_id and m.customer_id = auth.uid())
    and (machine_hose_id is null or exists (
      select 1 from public.machine_hoses h
      where h.id = machine_hose_id and h.machine_id = hose_checks.machine_id and h.customer_id = auth.uid()))
  );

create policy "hose_checks_update" on public.hose_checks for update
  using (customer_id = auth.uid())
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.machines m where m.id = machine_id and m.customer_id = auth.uid())
    and (machine_hose_id is null or exists (
      select 1 from public.machine_hoses h
      where h.id = machine_hose_id and h.machine_id = hose_checks.machine_id and h.customer_id = auth.uid()))
  );

create policy "hose_checks_delete" on public.hose_checks for delete
  using (customer_id = auth.uid());
