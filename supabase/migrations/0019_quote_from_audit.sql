-- M4c-2: "Create quote from audit" (docs/IMPLEMENTATION_PLAN.md).
--
-- 1. requests.audit_id — a quote request made from a hose audit.
-- 2. create_quote_from_audit(): the audit's supplier (or an admin) ticks the
--    audited hoses to replace and prices the job — hose assemblies only
--    (pickup / delivery) or with on-site installation (callout, travel,
--    labour). It creates the request for the audit's customer plus a
--    confirmed quote, which the customer accepts through the normal /r/:id
--    link or My requests. SECURITY DEFINER because requests_insert /
--    create_request() only let a customer create their own requests.
--    Each assembly carries the matching hose in the customer's register
--    (machineHoseId), found the same way 0018 synced the audit.
-- 3. log_completed_job_to_register() (0013) now also handles a job that
--    covers several machines: every register hose an assembly points at is
--    updated and each of those machines gets a service-log entry. Jobs
--    linked to one machine behave exactly as before.
-- 4. get_request_by_token() also returns what the quote is for (assemblies,
--    notes, on-site / delivery), so the /r/:id page can show it.
--
-- Idempotent: safe to run more than once.

-- ---------- 1. requests.audit_id ----------

-- Nullable: create_request() builds rows with jsonb_populate_record.
alter table public.requests
  add column if not exists audit_id uuid references public.audits(id) on delete set null;

create index if not exists requests_audit_id_idx on public.requests (audit_id);

-- ---------- 2. create_quote_from_audit() ----------

create or replace function public.create_quote_from_audit(
  p_audit_id         uuid,
  p_item_ids         uuid[],
  p_on_site          boolean,
  p_hoses_price      numeric,
  p_lead_time_days   integer,
  p_callout_fee      numeric default 0,
  p_travel_charge    numeric default 0,
  p_labour_hours     numeric default 0,
  p_hourly_rate      numeric default 0,
  p_fulfillment      text    default 'pickup',
  p_delivery_fee     numeric default 0,
  p_delivery_address text    default null,
  p_notes            text    default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  a           public.audits;
  v_item      public.audit_items;
  v_assems    jsonb := '[]'::jsonb;
  v_hose      uuid;
  v_machines  uuid[] := '{}';
  v_unmatched boolean := false;
  v_machine   uuid;
  v_ms        bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_req_id    text;
  v_quote_id  text;
  v_token     uuid;
  v_delivery  boolean := not coalesce(p_on_site, false) and p_fulfillment = 'delivery';
  v_del_fee   numeric := 0;
  v_labour    numeric := 0;
  v_price     numeric;
  v_fs        jsonb;
  v_count     integer;
begin
  select * into a from public.audits where id = p_audit_id;
  if a.id is null then raise exception 'audit not found'; end if;
  if not (public.is_admin() or coalesce(a.supplier_id = public.my_supplier_id(), false)) then
    raise exception 'only the audit''s supplier can quote from it';
  end if;
  if a.status = 'cancelled' then raise exception 'this audit is cancelled'; end if;

  if coalesce(p_hoses_price, -1) < 0 or coalesce(p_callout_fee, 0) < 0 or coalesce(p_travel_charge, 0) < 0
     or coalesce(p_labour_hours, 0) < 0 or coalesce(p_hourly_rate, 0) < 0 or coalesce(p_delivery_fee, 0) < 0 then
    raise exception 'prices can''t be negative';
  end if;
  if p_lead_time_days is null or p_lead_time_days < 0 or p_lead_time_days > 365 then
    raise exception 'lead time must be between 0 and 365 days';
  end if;
  if p_fulfillment not in ('pickup', 'delivery') then raise exception 'unknown fulfillment'; end if;
  if v_delivery and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'enter the delivery address';
  end if;

  select count(*) into v_count from public.audit_items
   where audit_id = a.id and id = any(coalesce(p_item_ids, '{}'));
  if v_count = 0 then raise exception 'tick at least one hose to quote'; end if;
  if v_count <> cardinality(array(select distinct unnest(p_item_ids))) then
    raise exception 'a ticked hose isn''t on this audit';
  end if;

  -- One assembly per ticked hose, linked to its register hose when the
  -- customer has one (machine matched by name, hose by position, as 0018).
  for v_item in
    select * from public.audit_items
     where audit_id = a.id and id = any(p_item_ids)
     order by lower(trim(machine_label)), created_at
  loop
    v_hose := null;
    if a.customer_id is not null then
      select h.id, h.machine_id into v_hose, v_machine
        from public.machine_hoses h
        join public.machines m on m.id = h.machine_id
       where m.customer_id = a.customer_id
         and lower(trim(m.name)) = lower(trim(v_item.machine_label))
         and lower(trim(h.position)) = lower(trim(v_item.position))
       order by h.created_at
       limit 1;
    end if;
    if v_hose is null then
      v_unmatched := true;
    elsif not v_machine = any(v_machines) then
      v_machines := v_machines || v_machine;
    end if;

    v_assems := v_assems || jsonb_build_array(
      coalesce(v_item.spec, '{}'::jsonb)
      || jsonb_build_object(
           'id', 'asm_' || v_item.id,
           'quantity', 1,
           'label', trim(v_item.machine_label) || ' — ' || trim(v_item.position))
      || case when v_hose is not null then jsonb_build_object('machineHoseId', v_hose) else '{}'::jsonb end
    );
  end loop;

  if p_on_site then
    v_labour := round(coalesce(p_labour_hours, 0) * coalesce(p_hourly_rate, 0));
    v_fs := jsonb_build_object(
      'requested', true, 'status', 'quoted',
      'siteAddress', coalesce(a.site_address, a.location), 'accessNotes', null,
      'calloutFee', coalesce(p_callout_fee, 0), 'travelCharge', coalesce(p_travel_charge, 0),
      'labour', v_labour, 'labourHours', coalesce(p_labour_hours, 0)::text,
      'hourlyRate', coalesce(p_hourly_rate, 0)::text, 'customerLabourHours', null
    );
  end if;
  if v_delivery then v_del_fee := coalesce(p_delivery_fee, 0); end if;
  -- As elsewhere, price_low/high are the hoses (+ delivery); on-site costs
  -- live in field_service and are added on top when shown.
  v_price := p_hoses_price + v_del_fee;

  v_req_id := 'HQ-' || v_ms;
  while exists (select 1 from public.requests where id = v_req_id) loop
    v_ms := v_ms + 1;
    v_req_id := 'HQ-' || v_ms;
  end loop;
  v_quote_id := 'Q-' || v_ms || '-' || a.supplier_id;

  insert into public.requests (
    id, request_type, status, selected_supplier_id, customer_id, urgency, location,
    field_service_requested, site_address, fulfillment, delivery_address,
    name, phone, email, notes, assemblies, machine_id, audit_id
  ) values (
    v_req_id, 'quote', 'open', a.supplier_id, a.customer_id, 'standard', a.location,
    coalesce(p_on_site, false), case when p_on_site then coalesce(a.site_address, a.location) end,
    case when v_delivery then 'delivery' else 'pickup' end,
    case when v_delivery then trim(p_delivery_address) end,
    a.customer_name, a.customer_phone, a.customer_email,
    'Quote from your hose audit'
      || coalesce(' on ' || to_char(coalesce(a.completed_at, now()) at time zone 'Australia/Sydney', 'DD Mon YYYY'), '')
      || coalesce(E'\n' || nullif(trim(p_notes), ''), ''),
    v_assems,
    -- One machine and every hose found in the register: link the job to it,
    -- like a re-order from the register. Otherwise each assembly's
    -- machineHoseId does the linking (see 3. below).
    case when cardinality(v_machines) = 1 and not v_unmatched then v_machines[1] end,
    a.id
  )
  returning access_token into v_token;

  -- Created pending, then confirmed: the notify webhook emails the customer
  -- "your quote is ready" on that status change, as for any manual quote.
  insert into public.quotes (
    id, request_id, supplier_id, is_booking, price_low, price_high, lead_time_days,
    quote_type, status, field_service, hose_assembly_cost, delivery_charge,
    callout_fee, travel_charge, labour
  ) values (
    v_quote_id, v_req_id, a.supplier_id, false, v_price, v_price, p_lead_time_days,
    'manual', 'pending', v_fs, p_hoses_price, case when v_delivery then v_del_fee end,
    case when p_on_site then coalesce(p_callout_fee, 0) end,
    case when p_on_site then coalesce(p_travel_charge, 0) end,
    case when p_on_site then v_labour end
  );
  update public.quotes set status = 'confirmed' where id = v_quote_id;

  return json_build_object('request_id', v_req_id, 'quote_id', v_quote_id, 'access_token', v_token);
end;
$$;

revoke all on function public.create_quote_from_audit(uuid, uuid[], boolean, numeric, integer, numeric, numeric, numeric, numeric, text, numeric, text, text) from public, anon;
grant execute on function public.create_quote_from_audit(uuid, uuid[], boolean, numeric, integer, numeric, numeric, numeric, numeric, text, numeric, text, text) to authenticated;

-- ---------- 3. completed job -> register, across machines ----------

create or replace function public.log_completed_job_to_register()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  req       public.requests;
  mach      public.machines;
  asm       jsonb;
  v_spec    jsonb;
  hose_id   uuid;
  v_hoses   uuid[];
  v_logged  uuid[] := '{}';
  v_target  uuid;
  done_on   date := coalesce(new.completed_at, now())::date;
  price     text;
  uuid_re   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select * into req from public.requests where id = new.request_id;
  if req.customer_id is null then return new; end if;

  -- register hoses the job's assemblies were made for
  if req.request_type = 'quote' and jsonb_typeof(req.assemblies) = 'array' then
    select coalesce(array_agg((x ->> 'machineHoseId')::uuid), '{}') into v_hoses
      from jsonb_array_elements(req.assemblies) x
     where x ->> 'machineHoseId' ~* uuid_re;
  else
    v_hoses := '{}';
  end if;

  price := case
    when new.price_low is null then ''
    when new.price_high is null or new.price_high = new.price_low then ' — quoted $' || new.price_low
    else ' — quoted $' || new.price_low || '–$' || new.price_high
  end;

  -- One entry per machine per job, even if a quote is re-completed. Only
  -- the customer's own machines: the linked one and those of the hoses.
  for mach in
    select m.* from public.machines m
     where m.customer_id = req.customer_id
       and ( m.id = req.machine_id
             or m.id in (select h.machine_id from public.machine_hoses h where h.id = any(v_hoses)) )
  loop
    if not exists (select 1 from public.service_log where request_id = req.id and machine_id = mach.id) then
      insert into public.service_log (customer_id, machine_id, kind, performed_at, supplier_id, request_id, notes)
      values (
        mach.customer_id, mach.id,
        case when req.request_type = 'booking' then 'repair' else 'hose_replaced' end,
        done_on, new.supplier_id, req.id,
        'HoseQuote job ' || req.id || price
      );
      v_logged := v_logged || mach.id;
    end if;
  end loop;

  if cardinality(v_logged) = 0 then return new; end if;

  if req.request_type = 'quote' and jsonb_typeof(req.assemblies) = 'array' then
    for asm in select value from jsonb_array_elements(req.assemblies) loop
      v_spec := asm - 'id' - 'quantity' - 'machineHoseId' - 'label';
      hose_id := case when asm ->> 'machineHoseId' ~* uuid_re then (asm ->> 'machineHoseId')::uuid end;
      select h.machine_id into v_target from public.machine_hoses h
       where h.id = hose_id and h.machine_id = any(v_logged);
      if v_target is not null then
        update public.machine_hoses
           set spec = v_spec, installed_at = done_on, supplier_id = new.supplier_id, request_id = req.id
         where id = hose_id;
      elsif req.machine_id = any(v_logged) then
        insert into public.machine_hoses (customer_id, machine_id, position, spec, installed_at, supplier_id, request_id)
        values (req.customer_id, req.machine_id, 'Hose from job ' || req.id, v_spec, done_on, new.supplier_id, req.id);
      end if;
      v_target := null;
    end loop;
  end if;

  return new;
exception when others then
  -- The register is a convenience; never fail the supplier's "mark complete".
  raise warning 'log_completed_job_to_register(%): %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.log_completed_job_to_register() from public, anon, authenticated;

-- ---------- 4. get_request_by_token(): what the quote is for ----------

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
      'from_audit', r.audit_id is not null),
    'quotes', coalesce((
      select json_agg(json_build_object(
        'id', q.id, 'status', q.status, 'price_low', q.price_low, 'price_high', q.price_high,
        'lead_time_days', q.lead_time_days, 'supplier_id', q.supplier_id, 'field_service', q.field_service
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
