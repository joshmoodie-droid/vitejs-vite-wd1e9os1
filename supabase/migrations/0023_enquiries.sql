-- Enquiries: "Ask a supplier".
--
-- A signed-in customer who isn't sure what they need describes it (text plus
-- up to 3 photos per message) and a supplier replies with a way forward. It is
-- a message thread, not live chat: emails and a page refresh.
--
-- Who gets an enquiry: the supplier with suppliers.takes_enquiries = true (for
-- now only "HoseQuote", for testing). create_inquiry() picks it server-side, so
-- a customer can't aim an enquiry at an arbitrary supplier.
--
-- Contact details are deliberately NOT on the enquiry. The supplier sees only a
-- display name; the customer's email and phone stay private (emails are sent by
-- the server), the same way quotes keep contact hidden until a job is accepted.
--
-- All writes go through the SECURITY DEFINER functions below. Clients get SELECT
-- only, so a direct insert/update/delete is refused by the grants themselves
-- (not silently by row-level security).
--
-- Roles: one person can be both a customer and an admin (the owner testing), so
-- every action takes an explicit p_as ('customer' | 'supplier') and the server
-- checks the caller really may act as that role.
--
-- Idempotent: safe to run more than once.

-- ---------- which supplier takes enquiries ----------

alter table public.suppliers
  add column if not exists takes_enquiries boolean not null default false;

update public.suppliers set takes_enquiries = true where company_name = 'HoseQuote';

-- ---------- tables ----------

create table if not exists public.inquiries (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references auth.users(id) on delete cascade,
  supplier_id      uuid not null references public.suppliers(id) on delete cascade,
  subject          text not null check (length(trim(subject)) between 1 and 120),
  status           text not null default 'open'
                   check (status in ('open', 'replied', 'quote_sent', 'closed')),
  customer_name    text not null default 'Customer',  -- display name only
  location         text,                              -- suburb / postcode
  machine_id       uuid references public.machines(id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  customer_read_at timestamptz,
  supplier_read_at timestamptz,
  closed_at        timestamptz
);

create index if not exists inquiries_customer_idx on public.inquiries (customer_id, last_message_at desc);
create index if not exists inquiries_supplier_idx on public.inquiries (supplier_id, last_message_at desc);

create table if not exists public.inquiry_messages (
  id          uuid primary key default gen_random_uuid(),
  inquiry_id  uuid not null references public.inquiries(id) on delete cascade,
  sender      text not null check (sender in ('customer', 'supplier')),
  sender_id   uuid references auth.users(id) on delete set null,
  body        text not null check (length(trim(body)) between 1 and 4000),
  photos      jsonb not null default '[]'::jsonb
              check (case when jsonb_typeof(photos) = 'array' then jsonb_array_length(photos) <= 3 else false end),
  created_at  timestamptz not null default now()
);

create index if not exists inquiry_messages_thread_idx on public.inquiry_messages (inquiry_id, created_at);

-- ---------- helpers (SECURITY DEFINER: no RLS recursion) ----------

create or replace function public.inquiry_visible_to_me(p_inquiry_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.inquiries i
    where i.id = p_inquiry_id
      and (i.customer_id = auth.uid()
           or public.is_admin()
           or (public.my_supplier_id() is not null and i.supplier_id = public.my_supplier_id()))
  );
$$;

grant execute on function public.inquiry_visible_to_me(uuid) to authenticated;

-- May the caller act as p_as on this enquiry? Unknown enquiry => false, so the
-- answer never reveals whether an id exists.
create or replace function public._inquiry_acting_as(p_inquiry_id uuid, p_as text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_as = 'customer' then exists (
      select 1 from public.inquiries i
      where i.id = p_inquiry_id and i.customer_id = auth.uid())
    when p_as = 'supplier' then exists (
      select 1 from public.inquiries i
      where i.id = p_inquiry_id
        and (public.is_admin()
             or (public.my_supplier_id() is not null and i.supplier_id = public.my_supplier_id())))
    else false
  end;
$$;

-- Photos must be in the caller's own storage folder (that is the only place the
-- storage policy lets anyone upload), so nobody can attach someone else's photo
-- path to a message in order to read it.
create or replace function public._inquiry_clean_photos(p_photos jsonb)
returns jsonb
language plpgsql stable
as $$
declare
  v jsonb := coalesce(p_photos, '[]'::jsonb);
  p text;
begin
  if jsonb_typeof(v) <> 'array' then
    raise exception 'photos must be a list';
  end if;
  if jsonb_array_length(v) > 3 then
    raise exception 'at most 3 photos per message';
  end if;
  for p in select jsonb_array_elements_text(v) loop
    if split_part(p, '/', 1) <> auth.uid()::text or position('..' in p) > 0 then
      raise exception 'photo does not belong to you';
    end if;
  end loop;
  return v;
end;
$$;

revoke all on function public._inquiry_acting_as(uuid, text) from public, anon, authenticated;
revoke all on function public._inquiry_clean_photos(jsonb)   from public, anon, authenticated;

-- ---------- customer: start an enquiry ----------

create or replace function public.create_inquiry(
  p_subject    text,
  p_body       text,
  p_location   text,
  p_machine_id uuid,
  p_photos     jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_supplier uuid;
  v_name     text;
  v_id       uuid;
  v_photos   jsonb;
  v_open     int;
begin
  if v_uid is null then
    raise exception 'sign in to send an enquiry';
  end if;
  if length(trim(coalesce(p_subject, ''))) = 0 then
    raise exception 'a subject is required';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'describe what you need';
  end if;
  if p_machine_id is not null and not exists (
    select 1 from public.machines m where m.id = p_machine_id and m.customer_id = v_uid
  ) then
    raise exception 'unknown machine';
  end if;

  select count(*) into v_open from public.inquiries
   where customer_id = v_uid and status in ('open', 'replied');
  if v_open >= 5 then
    raise exception 'you already have 5 open enquiries - close one first';
  end if;

  select id into v_supplier from public.suppliers
   where takes_enquiries order by created_at, id limit 1;
  if v_supplier is null then
    raise exception 'no supplier is taking enquiries right now';
  end if;

  v_photos := public._inquiry_clean_photos(p_photos);

  select coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1))
    into v_name
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = v_uid;

  insert into public.inquiries (customer_id, supplier_id, subject, customer_name, location, machine_id, customer_read_at)
  values (v_uid, v_supplier, left(trim(p_subject), 120), coalesce(v_name, 'Customer'),
          nullif(trim(coalesce(p_location, '')), ''), p_machine_id, now())
  returning id into v_id;

  insert into public.inquiry_messages (inquiry_id, sender, sender_id, body, photos)
  values (v_id, 'customer', v_uid, trim(p_body), v_photos);

  return v_id;
end;
$$;

-- ---------- either side: reply, mark read, close ----------

create or replace function public.post_inquiry_message(
  p_inquiry_id uuid,
  p_as         text,
  p_body       text,
  p_photos     jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_status text;
  v_photos jsonb;
  v_msg    uuid;
begin
  if v_uid is null then
    raise exception 'sign in to reply';
  end if;
  if not public._inquiry_acting_as(p_inquiry_id, p_as) then
    raise exception 'not allowed';
  end if;
  select status into v_status from public.inquiries where id = p_inquiry_id;
  if v_status = 'closed' then
    raise exception 'this enquiry is closed';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'write a message';
  end if;

  v_photos := public._inquiry_clean_photos(p_photos);

  insert into public.inquiry_messages (inquiry_id, sender, sender_id, body, photos)
  values (p_inquiry_id, p_as, v_uid, trim(p_body), v_photos)
  returning id into v_msg;

  update public.inquiries set
    last_message_at  = now(),
    status           = case
                         when p_as = 'supplier' and status = 'open'    then 'replied'
                         when p_as = 'customer' and status = 'replied' then 'open'
                         else status
                       end,
    customer_read_at = case when p_as = 'customer' then now() else customer_read_at end,
    supplier_read_at = case when p_as = 'supplier' then now() else supplier_read_at end
  where id = p_inquiry_id;

  return v_msg;
end;
$$;

create or replace function public.mark_inquiry_read(p_inquiry_id uuid, p_as text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public._inquiry_acting_as(p_inquiry_id, p_as) then
    raise exception 'not allowed';
  end if;
  update public.inquiries set
    customer_read_at = case when p_as = 'customer' then now() else customer_read_at end,
    supplier_read_at = case when p_as = 'supplier' then now() else supplier_read_at end
  where id = p_inquiry_id;
end;
$$;

create or replace function public.close_inquiry(p_inquiry_id uuid, p_as text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public._inquiry_acting_as(p_inquiry_id, p_as) then
    raise exception 'not allowed';
  end if;
  update public.inquiries
     set status = 'closed', closed_at = now()
   where id = p_inquiry_id and status <> 'closed';
end;
$$;

revoke all on function public.create_inquiry(text, text, text, uuid, jsonb)        from public, anon;
revoke all on function public.post_inquiry_message(uuid, text, text, jsonb)        from public, anon;
revoke all on function public.mark_inquiry_read(uuid, text)                        from public, anon;
revoke all on function public.close_inquiry(uuid, text)                            from public, anon;
grant execute on function public.create_inquiry(text, text, text, uuid, jsonb)     to authenticated;
grant execute on function public.post_inquiry_message(uuid, text, text, jsonb)     to authenticated;
grant execute on function public.mark_inquiry_read(uuid, text)                     to authenticated;
grant execute on function public.close_inquiry(uuid, text)                         to authenticated;

-- ---------- grants + RLS: read only ----------

revoke all on public.inquiries, public.inquiry_messages from anon, authenticated;
grant select on public.inquiries, public.inquiry_messages to authenticated;

alter table public.inquiries        enable row level security;
alter table public.inquiry_messages enable row level security;

drop policy if exists "inquiries_select"        on public.inquiries;
drop policy if exists "inquiry_messages_select" on public.inquiry_messages;

create policy "inquiries_select" on public.inquiries for select using (
  public.is_admin()
  or customer_id = auth.uid()
  or (public.my_supplier_id() is not null and supplier_id = public.my_supplier_id())
);

create policy "inquiry_messages_select" on public.inquiry_messages for select using (
  public.inquiry_visible_to_me(inquiry_id)
);

-- ---------- photos: enquiry participants can see each other's photos ----------
-- The existing rule (0014 + 0017) plus one clause. Everything else is unchanged.

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
    or exists (
      select 1 from public.audit_items i
      where i.photos ? p_path
        and public.audit_visible_to_me(i.audit_id)
        and public.photo_uploaded_for_audit(p_path, i.audit_id)
    )
    or exists (
      select 1 from public.inquiry_messages m
      where m.photos ? p_path
        and public.inquiry_visible_to_me(m.inquiry_id)
    )
  );
$$;
