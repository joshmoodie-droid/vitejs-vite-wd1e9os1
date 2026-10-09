-- STEP 2 of 2 — WIPE all activity (production). CANNOT BE UNDONE.
--
-- Deletes: every quote request, booking, quote/job, contact unlock,
-- commission record, hose audit, customer machine, register hose, machine
-- log entry and hose check.
-- Keeps: suppliers, their pricing and fee rates, admin access, user logins
-- and profiles.
--
-- All in one go: if anything fails, nothing is deleted. TRUNCATE doesn't
-- fire the email webhooks, so nobody is emailed.

begin;

truncate table
  public.commissions,
  public.connections,
  public.quotes,
  public.requests,
  public.hose_checks,
  public.service_log,
  public.machine_hoses,
  public.machines,
  public.audit_items,
  public.audits;

commit;

-- Should all be 0:
select item, n from (values
  ('requests',      (select count(*) from public.requests)),
  ('quotes',        (select count(*) from public.quotes)),
  ('audits',        (select count(*) from public.audits)),
  ('machines',      (select count(*) from public.machines)),
  ('hose checks',   (select count(*) from public.hose_checks)),
  ('commissions',   (select count(*) from public.commissions))
) t(item, n);
