-- M2: connect quote/booking jobs to the maintenance register
-- (docs/IMPLEMENTATION_PLAN.md).
--
-- 1. requests.machine_id — a signed-in customer can say which of their
--    machines a request is for. Only their own machine: checked in
--    create_request() (SECURITY DEFINER, bypasses RLS) and in the direct
--    insert policy.
-- 2. When a supplier marks a quote `completed`, a trigger writes the job into
--    that machine's register: one service_log entry, and a machine_hoses row
--    per hose assembly — updating the saved hose an assembly was re-ordered
--    from (assembly.machineHoseId), or adding a new one the customer can
--    rename. It never blocks the supplier's update: any error is downgraded
--    to a warning.
--
-- Idempotent: safe to run more than once.

-- ---------- 1. requests.machine_id ----------

alter table public.requests
  add column if not exists machine_id uuid references public.machines(id) on delete set null;

create index if not exists requests_machine_id_idx on public.requests (machine_id);

-- SECURITY DEFINER so it works inside RLS policies evaluated as anon (which
-- has no grant on machines) without erroring.
create or replace function public.owns_machine(p_machine_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.machines
    where id = p_machine_id and customer_id = auth.uid()
  );
$$;

grant execute on function public.owns_machine(uuid) to anon, authenticated;

drop policy if exists "requests_insert" on public.requests;
create policy "requests_insert" on public.requests for insert with check (
  (customer_id is null or customer_id = auth.uid())
  and (machine_id is null or public.owns_machine(machine_id))
);

-- create_request(): same as 0008, plus the machine ownership check.
create or replace function public.create_request(r jsonb)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  rec public.requests;
begin
  if (r ->> 'customer_id') is not null
     and (r ->> 'customer_id')::uuid is distinct from auth.uid() then
    raise exception 'cannot create a request for another user';
  end if;

  rec := jsonb_populate_record(null::public.requests, r);
  if rec.machine_id is not null and not public.owns_machine(rec.machine_id) then
    raise exception 'cannot link a request to another customer''s machine';
  end if;
  if rec.access_token is null then rec.access_token := gen_random_uuid(); end if;
  if rec.created_at  is null then rec.created_at  := now(); end if;

  insert into public.requests values (rec.*) returning * into rec;

  return json_build_object(
    'id', rec.id,
    'access_token', rec.access_token,
    'created_at', rec.created_at
  );
end;
$$;

-- ---------- 2. completed job -> register ----------

create or replace function public.log_completed_job_to_register()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  req     public.requests;
  mach    public.machines;
  asm     jsonb;
  v_spec  jsonb;
  hose_id uuid;
  done_on date := coalesce(new.completed_at, now())::date;
  price   text;
begin
  select * into req from public.requests where id = new.request_id;
  if req.machine_id is null then return new; end if;

  select * into mach from public.machines where id = req.machine_id;
  -- machine deleted, or (defensively) not the requesting customer's
  if mach.id is null or mach.customer_id is distinct from req.customer_id then return new; end if;

  -- one entry per job, even if a quote is re-completed
  if exists (select 1 from public.service_log where request_id = req.id and machine_id = mach.id) then
    return new;
  end if;

  price := case
    when new.price_low is null then ''
    when new.price_high is null or new.price_high = new.price_low then ' — quoted $' || new.price_low
    else ' — quoted $' || new.price_low || '–$' || new.price_high
  end;

  insert into public.service_log (customer_id, machine_id, kind, performed_at, supplier_id, request_id, notes)
  values (
    mach.customer_id, mach.id,
    case when req.request_type = 'booking' then 'repair' else 'hose_replaced' end,
    done_on, new.supplier_id, req.id,
    'HoseQuote job ' || req.id || price
  );

  if req.request_type = 'quote' and jsonb_typeof(req.assemblies) = 'array' then
    for asm in select value from jsonb_array_elements(req.assemblies) loop
      v_spec := asm - 'id' - 'quantity' - 'machineHoseId';
      hose_id := case
        when asm ->> 'machineHoseId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (asm ->> 'machineHoseId')::uuid
      end;
      if hose_id is not null
         and exists (select 1 from public.machine_hoses where id = hose_id and machine_id = mach.id) then
        update public.machine_hoses
           set spec = v_spec, installed_at = done_on, supplier_id = new.supplier_id, request_id = req.id
         where id = hose_id;
      else
        insert into public.machine_hoses (customer_id, machine_id, position, spec, installed_at, supplier_id, request_id)
        values (mach.customer_id, mach.id, 'Hose from job ' || req.id, v_spec, done_on, new.supplier_id, req.id);
      end if;
    end loop;
  end if;

  return new;
exception when others then
  -- The register is a convenience; never fail the supplier's "mark complete".
  raise warning 'log_completed_job_to_register(%): %', new.id, sqlerrm;
  return new;
end;
$$;

-- Trigger-only: nobody should call this directly.
revoke all on function public.log_completed_job_to_register() from public, anon, authenticated;

drop trigger if exists quotes_completed_to_register on public.quotes;
create trigger quotes_completed_to_register
  after update of status on public.quotes
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.log_completed_job_to_register();
