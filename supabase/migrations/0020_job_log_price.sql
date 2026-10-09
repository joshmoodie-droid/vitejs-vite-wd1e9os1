-- Job price in the maintenance register log (follow-up to 0013 / 0019).
--
-- When a supplier marks a job complete, the service-log entry read
-- "HoseQuote job HQ-… — quoted $X" using only the hoses price. On-site jobs
-- keep their callout, travel and labour in quotes.field_service, so those
-- were missing. The entry now shows the full job price, the same total the
-- customer saw on the quote page and in the emails.
--
-- Only log_completed_job_to_register() changes (plus a small helper);
-- behaviour is otherwise identical to 0019. Existing log entries are not
-- rewritten. Idempotent: safe to run more than once.

-- field_service values are typed in the app and stored as JSON text or
-- numbers; never let a stray value break "mark complete".
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
  v_extra   numeric := 0;
  v_lo      numeric;
  v_hi      numeric;
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

  -- On-site costs priced in field_service are part of the job's price, as on
  -- the quote page and in the emails (lib/pricing combinedTotal).
  if coalesce((new.field_service ->> 'requested')::boolean, false)
     and new.field_service ->> 'status' in ('quoted', 'confirmed') then
    v_extra := coalesce(public.try_numeric(new.field_service ->> 'calloutFee'), 0)
             + coalesce(public.try_numeric(new.field_service ->> 'travelCharge'), 0)
             + coalesce(public.try_numeric(new.field_service ->> 'labour'), 0);
  end if;
  v_lo := new.price_low + v_extra;
  v_hi := new.price_high + v_extra;
  price := case
    when v_lo is null then ''
    when v_hi is null or v_hi = v_lo then ' — quoted $' || trim_scale(round(v_lo, 2))
    else ' — quoted $' || trim_scale(round(v_lo, 2)) || '–$' || trim_scale(round(v_hi, 2))
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
