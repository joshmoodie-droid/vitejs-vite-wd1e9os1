-- Phase 3c: replace the wide-open `USING (true)` policies with real ones.
--
-- Model:
--   * admin  -> everything (public.is_admin(), email allowlist)
--   * supplier -> rows tied to their supplier id (public.my_supplier_id())
--   * customer -> their own requests (requests.customer_id = auth.uid())
--                 and the quotes / connections hanging off them
--   * anon    -> nothing on requests/quotes/connections; the /r/:id link flow
--                and the customer submit flow go through the Phase 3b
--                SECURITY DEFINER RPCs, which bypass RLS.
--
-- suppliers + supplier_pricing keep public SELECT (business info, no customer
-- PII) so the customer supplier-picker keeps working with no app change. Their
-- writes are locked to admin (+ own pricing row for a supplier).

-- ---------- helper fns (SECURITY DEFINER so policies don't recurse) ----------
-- Cross-table checks run as the function owner and therefore skip the other
-- table's RLS, which keeps requests<->quotes policy evaluation from looping.

create or replace function public.is_my_request(p_request_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.requests
    where id = p_request_id and customer_id = auth.uid()
  );
$$;

create or replace function public.supplier_on_request(p_request_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.my_supplier_id() is not null and exists (
    select 1 from public.quotes
    where request_id = p_request_id and supplier_id = public.my_supplier_id()
  );
$$;

create or replace function public.quote_owned_by_supplier(p_quote_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.my_supplier_id() is not null and exists (
    select 1 from public.quotes
    where id = p_quote_id and supplier_id = public.my_supplier_id()
  );
$$;

create or replace function public.quote_visible_to_me(p_quote_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.quotes q
    where q.id = p_quote_id
      and ( q.supplier_id = public.my_supplier_id()
            or public.is_my_request(q.request_id) )
  );
$$;

grant execute on function public.is_my_request(text)            to anon, authenticated;
grant execute on function public.supplier_on_request(text)      to anon, authenticated;
grant execute on function public.quote_owned_by_supplier(text)  to anon, authenticated;
grant execute on function public.quote_visible_to_me(text)      to anon, authenticated;
-- anon needs EXECUTE too: RLS evaluates these as the querying role.
grant execute on function public.my_supplier_id()              to anon;

-- ======================= requests =======================
drop policy if exists "public read requests"   on public.requests;
drop policy if exists "public insert requests" on public.requests;
drop policy if exists "public update requests" on public.requests;

create policy "requests_select" on public.requests for select using (
  public.is_admin()
  or customer_id = auth.uid()
  or selected_supplier_id = public.my_supplier_id()
  or public.supplier_on_request(id)
);

-- anon / customer submit. Cannot stamp someone else's customer_id.
create policy "requests_insert" on public.requests for insert with check (
  customer_id is null or customer_id = auth.uid()
);

-- direct status edits are admin-only; the token accept path is an RPC.
create policy "requests_update" on public.requests for update
  using (public.is_admin()) with check (public.is_admin());

-- ======================= quotes =======================
drop policy if exists "public read quotes"   on public.quotes;
drop policy if exists "public insert quotes" on public.quotes;
drop policy if exists "public update quotes" on public.quotes;

create policy "quotes_select" on public.quotes for select using (
  public.is_admin()
  or supplier_id = public.my_supplier_id()
  or public.is_my_request(request_id)
);

create policy "quotes_insert" on public.quotes for insert with check (
  public.is_admin() or supplier_id = public.my_supplier_id()
);

create policy "quotes_update" on public.quotes for update
  using  (public.is_admin() or supplier_id = public.my_supplier_id())
  with check (public.is_admin() or supplier_id = public.my_supplier_id());

-- ======================= connections =======================
drop policy if exists "public read connections"   on public.connections;
drop policy if exists "public insert connections" on public.connections;
drop policy if exists "public update connections" on public.connections;

create policy "connections_select" on public.connections for select using (
  public.is_admin() or public.quote_visible_to_me(quote_id)
);

create policy "connections_insert" on public.connections for insert with check (
  public.is_admin() or public.quote_owned_by_supplier(quote_id)
);

create policy "connections_update" on public.connections for update
  using  (public.is_admin() or public.quote_owned_by_supplier(quote_id))
  with check (public.is_admin() or public.quote_owned_by_supplier(quote_id));

-- ======================= suppliers =======================
-- keep "public read suppliers" (SELECT) as-is.
drop policy if exists "public insert suppliers"    on public.suppliers;
drop policy if exists "anon can update suppliers"  on public.suppliers;
drop policy if exists "anon can delete suppliers"  on public.suppliers;

create policy "suppliers_insert" on public.suppliers for insert
  with check (public.is_admin());

create policy "suppliers_update" on public.suppliers for update
  using (public.is_admin()) with check (public.is_admin());

create policy "suppliers_delete" on public.suppliers for delete
  using (public.is_admin());

-- ======================= supplier_pricing =======================
-- keep "public read pricing" (SELECT) as-is.
drop policy if exists "public insert pricing" on public.supplier_pricing;
drop policy if exists "public update pricing" on public.supplier_pricing;

create policy "pricing_insert" on public.supplier_pricing for insert
  with check (public.is_admin());

create policy "pricing_update" on public.supplier_pricing for update
  using  (public.is_admin() or supplier_id = public.my_supplier_id())
  with check (public.is_admin() or supplier_id = public.my_supplier_id());
