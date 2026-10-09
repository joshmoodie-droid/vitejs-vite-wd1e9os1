-- M4c-1: audit report + maintenance register sync (docs/IMPLEMENTATION_PLAN.md).
--
-- 1. audits.report_sent_at — set by the audit-report Edge Function when it
--    emails the customer their report link.
-- 2. When an audit is completed for a customer with an account, write it
--    into their maintenance register:
--      * a machine per audited machine label (matched to an existing machine
--        of theirs by name, else created),
--      * a hose per audited hose (matched by position on that machine, else
--        created; an existing hose's spec is updated when the audit recorded
--        one),
--      * a hose check per audited hose — condition, recommendation, photos —
--        so it shows in the hose's photo timeline,
--      * one "Inspection" service-log entry per machine.
--    Runs once per audit (service_log.audit_id marks it done). Errors become
--    warnings: completing an audit must never fail because of the register.
--    Photos stay in the supplier's folder; 0017's can_view_photo() already
--    lets the audit's customer read them.
--
-- Idempotent: safe to run more than once.

alter table public.audits      add column if not exists report_sent_at timestamptz;
alter table public.service_log add column if not exists audit_id uuid references public.audits(id) on delete set null;
alter table public.hose_checks add column if not exists audit_id uuid references public.audits(id) on delete set null;

create index if not exists service_log_audit_idx on public.service_log (audit_id);

create or replace function public.audit_to_register()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_label   text;
  v_machine uuid;
  v_hose    uuid;
  v_item    public.audit_items;
  v_done_on date := coalesce(new.completed_at, now())::date;
  v_count   int;
  v_supplier text;
begin
  if exists (select 1 from public.service_log where audit_id = new.id) then
    return new;
  end if;
  select company_name into v_supplier from public.suppliers where id = new.supplier_id;

  for v_label in
    select distinct on (lower(trim(machine_label))) trim(machine_label)
    from public.audit_items where audit_id = new.id
    order by lower(trim(machine_label)), created_at
  loop
    select id into v_machine from public.machines
     where customer_id = new.customer_id and lower(trim(name)) = lower(v_label)
     order by created_at limit 1;
    if v_machine is null then
      insert into public.machines (customer_id, name, site)
      values (new.customer_id, v_label, new.site_address)
      returning id into v_machine;
    end if;

    v_count := 0;
    for v_item in
      select * from public.audit_items
       where audit_id = new.id and lower(trim(machine_label)) = lower(v_label)
       order by created_at
    loop
      v_count := v_count + 1;
      select id into v_hose from public.machine_hoses
       where machine_id = v_machine and lower(trim(position)) = lower(trim(v_item.position))
       order by created_at limit 1;
      if v_hose is null then
        insert into public.machine_hoses (customer_id, machine_id, position, spec, supplier_id)
        values (new.customer_id, v_machine, trim(v_item.position), v_item.spec, new.supplier_id)
        returning id into v_hose;
      elsif coalesce(v_item.spec ->> 'bore', '') <> '' or coalesce(v_item.spec ->> 'hoseType', '') <> '' then
        update public.machine_hoses set spec = v_item.spec where id = v_hose;
      end if;

      insert into public.hose_checks (customer_id, machine_id, machine_hose_id, checked_at, condition, notes, photos, audit_id)
      values (
        new.customer_id, v_machine, v_hose, coalesce(new.completed_at, now()), v_item.condition,
        nullif(concat_ws(' — ',
          'Supplier audit: ' || case v_item.action
            when 'replace_now' then 'replace now'
            when 'replace_next_service' then 'replace at next service'
            when 'monitor' then 'monitor'
            else 'no action needed' end,
          nullif(trim(v_item.recommendation), '')), ''),
        v_item.photos, new.id
      );
      v_hose := null;
    end loop;

    insert into public.service_log (customer_id, machine_id, kind, performed_at, supplier_id, notes, audit_id)
    values (
      new.customer_id, v_machine, 'inspection', v_done_on, new.supplier_id,
      'Hose audit by ' || coalesce(v_supplier, 'supplier') || ': ' || v_count || ' hose' ||
        case when v_count = 1 then '' else 's' end || ' checked' ||
        coalesce('. ' || nullif(trim(new.summary), ''), ''),
      new.id
    );
    v_machine := null;
  end loop;

  return new;
exception when others then
  raise warning 'audit_to_register(%): %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.audit_to_register() from public, anon, authenticated;

drop trigger if exists audits_completed_to_register on public.audits;
create trigger audits_completed_to_register
  after update on public.audits
  for each row
  when (
    new.status = 'completed' and new.customer_id is not null
    and (old.status is distinct from 'completed' or old.customer_id is distinct from new.customer_id)
  )
  execute function public.audit_to_register();
