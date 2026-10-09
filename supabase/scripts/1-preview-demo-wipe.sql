-- STEP 1 of 2 — PREVIEW (read-only, changes nothing).
-- Shows how many rows the wipe will delete, and what it keeps.

select 'WILL DELETE' as action, item, n from (values
  ('Quote requests & bookings', (select count(*) from public.requests)),
  ('Quotes / jobs',             (select count(*) from public.quotes)),
  ('Contact unlocks',           (select count(*) from public.connections)),
  ('Commission records',        (select count(*) from public.commissions)),
  ('Hose audits',               (select count(*) from public.audits)),
  ('Audited hoses',             (select count(*) from public.audit_items)),
  ('Customer machines',         (select count(*) from public.machines)),
  ('Register hoses',            (select count(*) from public.machine_hoses)),
  ('Machine log entries',       (select count(*) from public.service_log)),
  ('Hose checks',               (select count(*) from public.hose_checks))
) d(item, n)
union all
select 'KEEPS', item, n from (values
  ('Suppliers',                 (select count(*) from public.suppliers)),
  ('Supplier pricing',          (select count(*) from public.supplier_pricing)),
  ('Supplier fee rates',        (select count(*) from public.supplier_commission)),
  ('Admin emails',              (select count(*) from public.app_admin_emails)),
  ('User logins',               (select count(*) from auth.users))
) k(item, n);
