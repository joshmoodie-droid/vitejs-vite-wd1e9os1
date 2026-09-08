-- Phase 3d: drop the dead suppliers.passcode column.
--
-- Passcodes were the pre-3a supplier/admin login mechanism. Since 3a everyone
-- signs in with an email magic-link, so the column is unused -- but it's still
-- readable by anyone through the public `suppliers` SELECT policy, and the
-- Admin "add supplier" form still made it a required field. The app no longer
-- reads or writes it as of this change.

alter table public.suppliers drop column if exists passcode;
