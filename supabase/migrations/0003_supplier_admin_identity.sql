-- Phase 3a: real identity for suppliers and admin
-- Suppliers sign in with an email magic-link (same as customers). Admin is an
-- email allowlist. Helper functions back the RLS policies added in Phase 3c.

-- ---------- admin allowlist ----------
-- Email-based so it works before the person's auth user exists.

create table if not exists public.app_admin_emails (
  email text primary key
);

insert into public.app_admin_emails (email) values
  ('joshmoodie@gmail.com')
on conflict do nothing;

alter table public.app_admin_emails enable row level security;
-- no policies: only reachable through the security-definer helper below

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.app_admin_emails a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- supplier <-> auth user link ----------

alter table public.suppliers
  add column if not exists auth_user_id uuid references auth.users(id);

create unique index if not exists suppliers_auth_user_id_key
  on public.suppliers (auth_user_id) where auth_user_id is not null;

create or replace function public.my_supplier_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.suppliers where auth_user_id = auth.uid();
$$;

-- Called by the app right after a supplier signs in: links the supplier row
-- whose contact_email matches the (verified) account email. Returns the
-- supplier id, whether it was just linked or already linked to this user.
create or replace function public.claim_supplier()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  sid uuid;
begin
  update public.suppliers
     set auth_user_id = auth.uid()
   where auth_user_id is null
     and lower(contact_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning id into sid;

  if sid is null then
    select id into sid from public.suppliers where auth_user_id = auth.uid();
  end if;

  return sid;
end;
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_supplier_id() to authenticated;
grant execute on function public.claim_supplier() to authenticated;
