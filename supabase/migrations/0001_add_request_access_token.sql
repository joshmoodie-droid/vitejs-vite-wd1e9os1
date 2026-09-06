-- Phase 1 (email notifications)
-- Give every request a hard-to-guess token so a customer can open their
-- request from an email link *before* customer accounts exist (Phase 2).
-- The /r/:id deep-link view fetches a request by id + this token.

alter table public.requests
  add column if not exists access_token uuid not null default gen_random_uuid();

create index if not exists requests_access_token_idx
  on public.requests (access_token);

-- Backfill is automatic: the default fills existing rows on add.
