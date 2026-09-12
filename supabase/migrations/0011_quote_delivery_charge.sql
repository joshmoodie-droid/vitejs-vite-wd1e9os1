-- Persist the itemized delivery-fee line a supplier can set when reviewing
-- a hose quote's pricing before confirming (see AutoQuoteReview). The flat
-- default rate it's seeded from already lives in supplier_pricing.delivery_fee;
-- this column holds the actual per-quote value once the supplier confirms.
alter table public.quotes
  add column if not exists delivery_charge numeric;
