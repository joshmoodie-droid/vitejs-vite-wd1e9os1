-- Phase 2: customer accounts
-- Customers can sign in (Supabase Auth, email OTP). Their requests get
-- linked to their account so they can come back and see status / accept.
-- Anonymous requests are still allowed (customer_id stays null).

-- ---------- profiles ----------

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;

create policy "profiles: read own"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: insert own"
  on public.profiles for insert with check (auth.uid() = id);

-- auto-create a profile row on signup (bypasses RLS via security definer)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- link requests to a customer ----------

alter table public.requests
  add column if not exists customer_id uuid references auth.users(id);

create index if not exists requests_customer_id_idx on public.requests (customer_id);
create index if not exists requests_email_lower_idx on public.requests (lower(email));

-- NOTE: RLS is NOT enabled on public.requests / quotes / connections yet.
-- The app still reads them with the anon key. Phase 3 locks these down and
-- moves cross-tenant reads behind Edge Functions.
