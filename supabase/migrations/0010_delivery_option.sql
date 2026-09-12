-- Pickup vs delivery option for hose-quote requests (self-install jobs
-- only -- on-site installation already has the supplier handle drop-off).
-- create_request() populates these via jsonb_populate_record, so no RPC
-- change is needed; anon writes are already scoped by the existing RLS
-- policies on requests.

alter table public.requests
  add column if not exists fulfillment text not null default 'pickup'
    check (fulfillment in ('pickup', 'delivery')),
  add column if not exists delivery_address text,
  add column if not exists delivery_notes text;

-- Flat delivery/postage fee, supplier-configurable like callout_fee.
alter table public.supplier_pricing
  add column if not exists delivery_fee numeric not null default 15;
