-- 0007's create_request() used `insert into requests select * from
-- jsonb_populate_record(...)`, which writes an explicit NULL for every column
-- the caller didn't provide -- including access_token (NOT NULL, default
-- gen_random_uuid()). That NULL overrides the default and the insert fails.
--
-- Fix: populate the record, fill the columns that rely on a default, then
-- insert the record as-is.

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
