-- M3: real photo uploads on requests (docs/IMPLEMENTATION_PLAN.md).
--
-- Signed-in customers upload photos into a PRIVATE storage bucket, `photos`,
-- under their own folder: `<auth.uid()>/<uuid>.jpg`. A request lists the
-- photos attached to it in requests.photos (a JSON array of those paths).
--
-- Who can read a photo (signed URLs are only issued to callers who can):
--   * the customer who uploaded it (it's in their folder)
--   * admins
--   * a supplier on a request that lists the photo — and only if the photo
--     is in that request's customer's folder, so nobody can unlock another
--     customer's photo by putting its path into their own request.
-- Anonymous visitors can't upload or read anything (the anonymous quote form
-- keeps its paste-a-link field).
--
-- Idempotent: safe to run more than once.

-- ---------- requests.photos ----------

-- Nullable on purpose: create_request() uses jsonb_populate_record, which
-- writes NULL for keys the caller omits (see 0008), so NOT NULL would break
-- older clients. NULL and [] both mean "no photos".
alter table public.requests
  add column if not exists photos jsonb;

-- ---------- bucket ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- read access helper ----------

-- SECURITY DEFINER: reads requests regardless of the caller's RLS, so the
-- storage policy below stays a single cheap call.
create or replace function public.can_view_photo(p_path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    split_part(p_path, '/', 1) = auth.uid()::text
    or public.is_admin()
    or (
      public.my_supplier_id() is not null
      and exists (
        select 1 from public.requests r
        where r.photos ? p_path
          and r.customer_id is not null
          and split_part(p_path, '/', 1) = r.customer_id::text
          and (r.selected_supplier_id = public.my_supplier_id() or public.supplier_on_request(r.id))
      )
    )
  );
$$;

grant execute on function public.can_view_photo(text) to authenticated;

-- ---------- storage policies ----------

drop policy if exists "photos_insert_own_folder" on storage.objects;
drop policy if exists "photos_select"            on storage.objects;
drop policy if exists "photos_delete_own"        on storage.objects;

create policy "photos_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and split_part(name, '/', 1) = auth.uid()::text);

create policy "photos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.can_view_photo(name));

create policy "photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and split_part(name, '/', 1) = auth.uid()::text);

-- No UPDATE policy: photos are never overwritten in place.
