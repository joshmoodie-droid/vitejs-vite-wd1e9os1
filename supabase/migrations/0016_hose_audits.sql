-- M4b: supplier hose audits (docs/IMPLEMENTATION_PLAN.md, "M4b/M4c").
--
-- A hose audit is a supplier inspecting a customer's machines: for each hose
-- a condition, photos and a recommendation. It's charged as a flat fee plus
-- an optional per-machine fee, set in the supplier's pricing and paid to the
-- supplier directly.
--
-- Two ways in:
--   * a signed-in customer books one with book_audit() — the fee is copied
--     from the supplier's pricing server-side, so a customer can't set it;
--   * a supplier creates one for any customer (name + email) in their portal.
-- Supplier-created audits are linked to a customer account by email (same
-- trust model as claim_my_requests: whoever owns that address sees it).
-- A supplier can never point an audit at an arbitrary account id.
--
-- Report link, register sync and quote-from-audit come in M4c.
--
-- Idempotent: safe to run more than once.

-- ---------- pricing ----------

alter table public.supplier_pricing
  add column if not exists audit_fee numeric not null default 150 check (audit_fee >= 0),
  add column if not exists audit_fee_per_machine numeric not null default 0 check (audit_fee_per_machine >= 0);

-- ---------- audits ----------

create table if not exists public.audits (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  customer_id     uuid references auth.users(id) on delete set null,
  source          text not null check (source in ('customer', 'supplier')),
  status          text not null default 'requested'
                  check (status in ('requested', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  customer_name   text not null check (length(trim(customer_name)) > 0),
  customer_email  text,
  customer_phone  text,
  location        text,           -- suburb / postcode
  site_address    text,
  machines_count  int check (machines_count >= 0),  -- customer's estimate when booking
  preferred_time  text,
  notes           text,           -- booking notes from the customer
  scheduled_for   date,
  audit_fee       numeric not null default 0 check (audit_fee >= 0),
  per_machine_fee numeric not null default 0 check (per_machine_fee >= 0),
  summary         text,           -- supplier's overall findings
  completed_at    timestamptz,
  access_token    uuid not null default gen_random_uuid(),  -- report link (M4c)
  created_at      timestamptz not null default now()
);

create index if not exists audits_supplier_idx on public.audits (supplier_id, created_at desc);
create index if not exists audits_customer_idx on public.audits (customer_id);

-- ---------- audit_items ----------

create table if not exists public.audit_items (
  id             uuid primary key default gen_random_uuid(),
  audit_id       uuid not null references public.audits(id) on delete cascade,
  machine_label  text not null check (length(trim(machine_label)) > 0),  -- e.g. "Kubota KX040"
  position       text not null check (length(trim(position)) > 0),       -- e.g. "Boom cylinder – left"
  spec           jsonb not null default '{}'::jsonb,  -- same shape as a quote assembly
  condition      text not null check (condition in ('ok', 'watch', 'replace_soon', 'leaking')),
  action         text not null default 'none'
                 check (action in ('replace_now', 'replace_next_service', 'monitor', 'none')),
  recommendation text,
  photos         jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  created_at     timestamptz not null default now()
);

create index if not exists audit_items_audit_idx on public.audit_items (audit_id, machine_label, created_at);

-- ---------- helpers (SECURITY DEFINER: no RLS recursion) ----------

create or replace function public.audit_owned_by_supplier(p_audit_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.my_supplier_id() is not null and exists (
    select 1 from public.audits where id = p_audit_id and supplier_id = public.my_supplier_id()
  );
$$;

create or replace function public.audit_visible_to_me(p_audit_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.audits a
    where a.id = p_audit_id
      and (a.customer_id = auth.uid()
           or (public.my_supplier_id() is not null and a.supplier_id = public.my_supplier_id())
           or public.is_admin())
  );
$$;

grant execute on function public.audit_owned_by_supplier(uuid) to authenticated;
grant execute on function public.audit_visible_to_me(uuid) to authenticated;

-- Keep customer_id honest. Customer-booked audits keep the booker forever;
-- supplier-created ones follow the email the supplier entered.
create or replace function public.audits_link_customer()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.source = 'customer' then
    new.source := old.source;
    new.customer_id := old.customer_id;
  elsif new.source = 'supplier' then
    new.customer_id := (
      select u.id from auth.users u
      where new.customer_email is not null and lower(u.email) = lower(trim(new.customer_email))
      limit 1
    );
  end if;
  new.supplier_id := case when tg_op = 'UPDATE' then old.supplier_id else new.supplier_id end;
  return new;
end;
$$;

revoke all on function public.audits_link_customer() from public, anon, authenticated;

drop trigger if exists audits_link_customer on public.audits;
create trigger audits_link_customer
  before insert or update on public.audits
  for each row execute function public.audits_link_customer();

-- ---------- customer booking ----------

create or replace function public.book_audit(
  p_supplier_id    uuid,
  p_location       text,
  p_site_address   text,
  p_machines_count int,
  p_preferred_time text,
  p_phone          text,
  p_notes          text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id    uuid;
  v_name  text;
  v_email text;
  v_fee   numeric;
  v_per   numeric;
begin
  if auth.uid() is null then
    raise exception 'sign in to book a hose audit';
  end if;
  select audit_fee, audit_fee_per_machine into v_fee, v_per
    from public.supplier_pricing where supplier_id = p_supplier_id;
  if not found then
    raise exception 'unknown supplier';
  end if;
  select coalesce(nullif(trim(p.full_name), ''), u.email), u.email
    into v_name, v_email
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = auth.uid();

  insert into public.audits (
    supplier_id, customer_id, source, status, customer_name, customer_email, customer_phone,
    location, site_address, machines_count, preferred_time, notes, audit_fee, per_machine_fee
  ) values (
    p_supplier_id, auth.uid(), 'customer', 'requested', coalesce(v_name, 'Customer'), v_email,
    nullif(trim(p_phone), ''), nullif(trim(p_location), ''), nullif(trim(p_site_address), ''),
    greatest(coalesce(p_machines_count, 1), 1), nullif(trim(p_preferred_time), ''), nullif(trim(p_notes), ''),
    v_fee, v_per
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.book_audit(uuid, text, text, int, text, text, text) from public, anon;
grant execute on function public.book_audit(uuid, text, text, int, text, text, text) to authenticated;

-- ---------- grants + RLS ----------

revoke all on public.audits, public.audit_items from anon;
grant select, insert, update, delete on public.audits, public.audit_items to authenticated;

alter table public.audits      enable row level security;
alter table public.audit_items enable row level security;

drop policy if exists "audits_select" on public.audits;
drop policy if exists "audits_insert" on public.audits;
drop policy if exists "audits_update" on public.audits;
drop policy if exists "audits_delete" on public.audits;

create policy "audits_select" on public.audits for select using (
  public.is_admin()
  or customer_id = auth.uid()
  or (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id())
);
-- Direct inserts are supplier-created audits only; customers use book_audit().
create policy "audits_insert" on public.audits for insert with check (
  source = 'supplier' and public.my_supplier_id() is not null and supplier_id = public.my_supplier_id()
);
create policy "audits_update" on public.audits for update
  using (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id())
  with check (supplier_id = public.my_supplier_id());
create policy "audits_delete" on public.audits for delete
  using (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id() and source = 'supplier');

drop policy if exists "audit_items_select" on public.audit_items;
drop policy if exists "audit_items_insert" on public.audit_items;
drop policy if exists "audit_items_update" on public.audit_items;
drop policy if exists "audit_items_delete" on public.audit_items;

create policy "audit_items_select" on public.audit_items for select
  using (public.audit_visible_to_me(audit_id));
create policy "audit_items_insert" on public.audit_items for insert
  with check (public.audit_owned_by_supplier(audit_id));
create policy "audit_items_update" on public.audit_items for update
  using (public.audit_owned_by_supplier(audit_id)) with check (public.audit_owned_by_supplier(audit_id));
create policy "audit_items_delete" on public.audit_items for delete
  using (public.audit_owned_by_supplier(audit_id));
