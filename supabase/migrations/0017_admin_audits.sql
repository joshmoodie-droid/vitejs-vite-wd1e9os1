-- Admins can create and edit hose audits for any supplier, and audit photos
-- become visible to everyone who can see the audit.
--
-- 1. audits / audit_items: every write policy also allows public.is_admin().
--    (0016 let admins read only.) The audits_link_customer trigger still
--    pins supplier_id on update and links customers by email only, so an
--    admin edit can't move an audit to another supplier or account either.
-- 2. can_view_photo(): a photo listed on an audit item can be read by anyone
--    who can see that audit (its supplier, its customer, admins) — but only
--    if the photo was uploaded by that audit's supplier or by an admin, so
--    nobody can unlock someone else's photo by putting its path on an audit.
--    (Customers see audit photos in the report, M4c.)
--
-- Idempotent: safe to run more than once.

-- ---------- 1. admin write access ----------

drop policy if exists "audits_insert" on public.audits;
drop policy if exists "audits_update" on public.audits;
drop policy if exists "audits_delete" on public.audits;

create policy "audits_insert" on public.audits for insert with check (
  source = 'supplier' and (
    public.is_admin()
    or (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id())
  )
);
create policy "audits_update" on public.audits for update
  using (public.is_admin() or (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id()))
  with check (public.is_admin() or supplier_id = public.my_supplier_id());
-- Customer bookings are cancelled, not deleted — for admins too.
create policy "audits_delete" on public.audits for delete
  using (source = 'supplier' and (
    public.is_admin() or (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id())
  ));

drop policy if exists "audit_items_insert" on public.audit_items;
drop policy if exists "audit_items_update" on public.audit_items;
drop policy if exists "audit_items_delete" on public.audit_items;

create policy "audit_items_insert" on public.audit_items for insert
  with check (public.is_admin() or public.audit_owned_by_supplier(audit_id));
create policy "audit_items_update" on public.audit_items for update
  using (public.is_admin() or public.audit_owned_by_supplier(audit_id))
  with check (public.is_admin() or public.audit_owned_by_supplier(audit_id));
create policy "audit_items_delete" on public.audit_items for delete
  using (public.is_admin() or public.audit_owned_by_supplier(audit_id));

-- ---------- 2. audit photos ----------

-- True when the storage folder (first path segment) belongs to the audit's
-- supplier user or to an admin — the only people who can write audit items.
create or replace function public.photo_uploaded_for_audit(p_path text, p_audit_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.audits a
    join public.suppliers s on s.id = a.supplier_id
    where a.id = p_audit_id and s.auth_user_id::text = split_part(p_path, '/', 1)
  ) or exists (
    select 1 from auth.users u
    join public.app_admin_emails e on lower(e.email) = lower(u.email)
    where u.id::text = split_part(p_path, '/', 1)
  );
$$;

revoke all on function public.photo_uploaded_for_audit(text, uuid) from public, anon;
grant execute on function public.photo_uploaded_for_audit(text, uuid) to authenticated;

-- Same as 0014, plus the audit rule.
create or replace function public.can_view_photo(p_path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    split_part(p_path, '/', 1) = auth.uid()::text
    or public.is_admin()
    or (
      public.my_supplier_id() is not null
      and exists (
        select 1 from public.requests r
        where r.photos ? p_path
          and r.customer_id is not null
          and split_part(p_path, '/', 1) = r.customer_id::text
          and (r.selected_supplier_id = public.my_supplier_id() or public.supplier_on_request(r.id))
      )
    )
    or exists (
      select 1 from public.audit_items i
      where i.photos ? p_path
        and public.audit_visible_to_me(i.audit_id)
        and public.photo_uploaded_for_audit(p_path, i.audit_id)
    )
  );
$$;
