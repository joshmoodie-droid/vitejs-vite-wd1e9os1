-- "Is this database up to date?" — paste into the Supabase SQL editor and Run.
-- Every row should say true. A false row names the migration to (re-)run.
-- Read-only: changes nothing. Add a row here with every new migration.

select item, ok from (values
  ('0012 maintenance register (machines table)',      to_regclass('public.machines') is not null),
  ('0013 requests.machine_id',                         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'requests' and column_name = 'machine_id')),
  ('0013 completed job -> register trigger',          exists (select 1 from pg_trigger where tgname = 'quotes_completed_to_register')),
  ('0014 private photos bucket',                       exists (select 1 from storage.buckets where id = 'photos' and not public)),
  ('0015 hose_checks table',                           to_regclass('public.hose_checks') is not null),
  ('0016 audits table',                                to_regclass('public.audits') is not null),
  ('0016 book_audit function',                         exists (select 1 from pg_proc where proname = 'book_audit')),
  ('0017 admins can add audit hoses',                  exists (select 1 from pg_policies where tablename = 'audit_items' and cmd = 'INSERT' and with_check like '%is_admin%')),
  ('0018 audits.report_sent_at',                       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'audits' and column_name = 'report_sent_at')),
  ('0018 completed audit -> register trigger',        exists (select 1 from pg_trigger where tgname = 'audits_completed_to_register')),
  ('0019 requests.audit_id',                           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'requests' and column_name = 'audit_id')),
  ('0019 create_quote_from_audit function',            exists (select 1 from pg_proc where proname = 'create_quote_from_audit')),
  ('0019 multi-machine job -> register',               exists (select 1 from pg_proc where proname = 'log_completed_job_to_register' and prosrc like '%v_logged%')),
  ('0019 quote link shows what is quoted',             exists (select 1 from pg_proc where proname = 'get_request_by_token' and prosrc like '%from_audit%')),
  ('0020 job log shows full price',                    exists (select 1 from pg_proc where proname = 'log_completed_job_to_register' and prosrc like '%v_extra%'))
) as checks(item, ok)
order by item;
