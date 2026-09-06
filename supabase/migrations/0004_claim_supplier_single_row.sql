-- Phase 3a follow-up: make claim_supplier() link exactly one supplier row.
-- (If several supplier rows share a contact_email, the original version would
--  try to set the same auth_user_id on all of them and hit the unique index.)

create or replace function public.claim_supplier()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  sid uuid;
begin
  update public.suppliers s
     set auth_user_id = auth.uid()
   where s.id = (
     select id from public.suppliers
     where auth_user_id is null
       and lower(contact_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     order by created_at
     limit 1
   )
   returning s.id into sid;

  if sid is null then
    select id into sid from public.suppliers where auth_user_id = auth.uid();
  end if;

  return sid;
end;
$$;
