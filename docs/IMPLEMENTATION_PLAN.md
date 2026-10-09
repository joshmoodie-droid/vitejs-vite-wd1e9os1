# HoseQuote — implementation plan

Turns the ideas in [`ROADMAP.md`](./ROADMAP.md) into buildable milestones. Each
milestone is sized to land as 1–3 small PRs with green CI. Order is chosen so
every step ships something usable on its own and later steps build on it.

```
M0 Foundations ─┬─> M1 Maintenance register ──> M2 Jobs ↔ register + Order again ──┐
                │                                                                   ├─> M4 Photo hose checks ──> M5 Reminders
                └─> M3 Photo uploads ───────────────────────────────────────────────┘
M6 Commission tracking  (independent — can start any time after M0)
M7 Later: QR stickers, exports, paid tiers, emergency broadcast, Stripe Connect, fleet accounts
```

## Ground rules (apply to every milestone)

- **New code goes in its own typed modules**, not `src/App.tsx` (that file is
  `@ts-nocheck`; see its header). App.tsx only gets the minimum wiring — a new
  `customerView` value, a callback, a route.
- **Migrations are applied by hand to both projects** (staging
  `qliapjpxwlcnyjfwfdor`, then prod `qwycavfmdpknnflxlylw`) — see
  `docs/staging-setup.md`. Apply to staging *before* merging so CI tests the new
  schema; apply to prod right before the Vercel production deploy.
- **Every new table gets RLS on day one** and a matching anon-cannot-read /
  anon-cannot-write case in `scripts/rls-check.mjs`.
- **New customer tables carry `customer_id` directly** (`= auth.uid()` policies)
  rather than relying on joins — simpler policies, no recursion helpers needed.
- **Customer features require sign-in.** The anonymous quote/booking flow stays
  as-is; the register, photos history and reminders need an account (email OTP
  already exists). "Sign in to save this to your machines" becomes a nudge.
- CI must stay green: `npm audit`, lint, typecheck, build, Playwright smoke, RLS check.

---

## M0 — Foundations (do first)

| # | Task | Size | Notes |
|---|---|---|---|
| 0.1 | **Fix CI: `npm audit` fails on `main`** | S | 2 high advisories (`brace-expansion`, `source-map-js`) published after the last green run. `npm audit fix` → lockfile-only change. Blocks every other PR. |
| 0.2 | Small path router helper | S | `src/main.tsx` uses one regex for `/r/:id`. Add a tiny `matchRoute()` in `src/lib/routes.ts` so `/m/:machineId` and later `/scan/:code` slot in cleanly. |
| 0.3 | Owner tasks (no code) | — | Before charging money: Vercel Pro, Supabase Pro, verify `hosequote.com.au` in Resend, privacy policy + T&Cs page. See ROADMAP §1. |

## M1 — Maintenance register: machines + service log

The standalone value: a small business can record its machines and maintenance
even if it never orders a hose.

**Schema — `supabase/migrations/0012_maintenance_register.sql`**
```
machines      (id uuid pk, customer_id uuid → auth.users, name, make, model,
               year int, serial, rego, hours numeric, site, notes,
               created_at, archived_at)
machine_hoses (id uuid pk, customer_id, machine_id → machines on delete cascade,
               position text, spec jsonb   -- same shape as one request assembly
               installed_at date, supplier_id → suppliers null,
               request_id → requests null, replaced_at date, notes)
service_log   (id uuid pk, customer_id, machine_id → machines on delete cascade,
               kind text  -- hose_replaced | inspection | service | oil_filter | grease | repair | other
               performed_at date, hours numeric, cost numeric, performed_by text,
               supplier_id null, request_id null, notes, created_at)
```
RLS on all three: select/insert/update/delete where `customer_id = auth.uid()`.
Admin read via `public.is_admin()` (matches 0006).

**UI — `src/components/machines/`**
- `MyMachines.tsx` — list + "Add machine".
- `MachineForm.tsx` — add/edit.
- `MachineDetail.tsx` — header (make/model/hours), **Hoses** tab (register),
  **Log** tab (service history, newest first), "Add log entry".
- `HoseForm.tsx` — reuses `AssemblyCard` field set for the hose spec + position.
- `src/lib/machines.ts` — typed Supabase queries + row mappers (like `lib/rows.ts`).
- App.tsx wiring: add `customerView === "machines"` and a "My machines" link next
  to "My requests".

**Tests**: RLS check additions; Playwright smoke that the signed-out home still
renders (sign-in-gated screens aren't reachable in smoke tests today).

**Done when** a signed-in customer can add a machine, add hoses to it and log a
service, and another account can't see any of it.

## M2 — Connect jobs to the register + "Order again"

**Schema — `0013_request_machine_link.sql`**
- `requests.machine_id uuid null → machines`. `create_request()` already uses
  `jsonb_populate_record`, so the column flows through — but **add a check** that
  `machine_id`, if given, belongs to `auth.uid()` (same pattern as the existing
  `customer_id` guard).
- Trigger on `quotes` status → `completed`: if the request has a `machine_id`,
  insert a `service_log` row (`kind = hose_replaced`, supplier, request, cost =
  quoted price) and upsert `machine_hoses` from `requests.assemblies`.

**UI**
- `MyRequests` / request detail: **"Save hoses to a machine"** on accepted or
  completed requests (pick machine + position per assembly).
- **"Order again"** on a saved hose, a machine, or a past request → opens
  `CustomerFlow` with `form.assemblies` (and location/supplier) pre-filled. One
  App.tsx hook: `startPrefilledRequest(partialForm)`.
- "Get a quote for this machine" from `MachineDetail` → new request with
  `machine_id` set.
- Post-job email: in `supabase/functions/notify`, the `completed` email gets a
  "Save this hose to your machine / Order again" link.

**Done when** a completed job lands in the machine's log automatically and a
repeat order takes one tap from the register.

## M3 — Real photo uploads

Today the request form only has a "Photo URL" text field (`flows.tsx`).

- **Storage**: private bucket `photos`. Path `{auth.uid()}/{uuid}.jpg`.
  Storage policies: owner read/write by path prefix; suppliers read photos of
  requests they're quoting via a signed-URL Edge Function
  (`supabase/functions/photo-url`) that checks `supplier_on_request()`.
- **Client**: `src/lib/photos.ts` — `<input type="file" accept="image/*"
  capture="environment">`, resize/compress with a canvas to ~1600px / ~300 KB
  (no new dependency), upload, return the storage path.
- **Schema — `0014_request_photos.sql`**: `requests.photos jsonb` (array of
  paths). Keep `photo_url` for old rows.
- **Request form**: replace the URL field with an uploader (signed-in users);
  signed-out users keep the URL field plus a "Sign in to attach photos" nudge.
  *(Decision below.)*
- Supplier portal + `/r/:id` status page show thumbnails.

**Done when** a customer can snap 1–3 photos on their phone into a request and
the supplier sees them.

## M4 — Photo hose checks (weekly checks)

Builds on M1 + M3.

- **Schema — `0015_hose_checks.sql`**: `hose_checks (id, customer_id,
  machine_id, machine_hose_id null, checked_at, condition text  -- ok | watch |
  replace_soon | leaking, notes, photos jsonb, request_id null)`. RLS by customer.
- **"Check a hose" flow** (`src/components/checks/`): camera → pick machine +
  hose (or "new hose") → condition → save. Mobile-first.
- **"Check this machine"** guided checklist: steps through each registered hose.
- **Timeline per hose**: photos side by side, condition chips.
- **"Get a quote"** from a check with condition `replace_soon`/`leaking` →
  request pre-filled with spec (if hose known), photos and `machine_id`.
- Checks also appear in the machine's log (pre-start / inspection record).

**Done when** a customer can do a weekly walk-round in a couple of minutes and
turn a worn hose into a quote request without re-typing anything.

## M5 — Reminders

- **Schema — `0016_reminders.sql`**: `reminders (id, customer_id, machine_id,
  kind -- hose_check | service | hose_inspection, interval_days, next_due_at,
  last_sent_at, active)`.
- **Scheduled Edge Function** `supabase/functions/reminders` run daily
  (Supabase Cron): finds due reminders, sends one digest email per customer via
  Resend ("Weekly hose check — 3 machines"), advances `next_due_at`.
- UI: per-machine reminder settings; "snooze"/"done" from the email link.
- **Watch the Resend free-tier cap (100/day)** — upgrade to Pro before enabling
  weekly reminders for real users.
- Hour-meter based reminders come later (need hours entered regularly).

## M6 — Commission tracking (monetisation step 1)

Independent of M1–M5. Implements ROADMAP §3 "Option A".

- **Schema — `0017_commission.sql`**: `suppliers.commission_rate numeric default
  0.08`, `quotes.commission_amount numeric`, `quotes.accepted_at timestamptz`.
  Trigger computes `commission_amount = clamp(total × rate, 5, 50)` when status
  → `accepted`.
- **Admin portal**: "Commission" tab — per supplier per month: jobs, job value,
  commission due; CSV export for invoicing (Stripe invoices sent manually at first).
- Supplier portal: show "HoseQuote fee" on accepted jobs (transparency).
- Later: lower rate on repeat jobs (needs M2's machine/customer history),
  Stripe invoicing automation, Pro subscription tier.

## M7 — Later (not planned in detail yet)

QR cab stickers & hose tags (`/scan/:code` → machine page), PDF/CSV export of a
machine's history, paid Business tier (Stripe Billing), emergency broadcast +
SMS, Stripe Connect deposits, fleet accounts with multiple users, AI photo
assist (advisory only). See ROADMAP §3–§6.

---

## Decisions needed before building

1. **Sign-in required for the register and photos?** Recommended: yes (anon
   quote flow unchanged).
2. **Photos for signed-out customers** in the request form: keep URL field only
   (simple, recommended for M3) or allow anonymous uploads via an Edge Function
   (more work, abuse risk).
3. **Commission**: start M6 now or wait for more suppliers? Rate/min/cap
   (proposed 8%, A$5–50).
4. **Who applies migrations to prod** — you, via the SQL editor, per
   `docs/staging-setup.md`? (Claude can prepare and apply to staging if given a
   Supabase access token in the environment.)

## Suggested first sprint

1. M0.1 audit fix (PR, merge once green).
2. M0.2 router helper.
3. M1 schema + RLS tests (PR 1), then machines UI (PR 2).
