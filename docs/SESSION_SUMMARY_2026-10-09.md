# Session summary — 9–10 October 2026

What was planned, built and released for HoseQuote (hosequote.com.au) in one
evening session. Everything below is merged into `main`, live on Vercel, and
its database changes are applied to staging and production.

## 1. Business planning

Written up in [`docs/ROADMAP.md`](ROADMAP.md) (PR #57):

- **Running costs** of operating the app commercially (hosting, database,
  email, domain, monitoring) and **break-even** at a A$49/month supplier
  subscription.
- **Monetisation options**: commission per job / hose assembly, pay-per-lead,
  tiered subscriptions, featured placement, customer fees, fleet accounts,
  sponsorship. Suggested sequence: free to join + 8% commission (min $5, max
  $50), invoiced monthly.
- **Customer retention**: remember every hose, one-tap re-order, QR stickers,
  reminders, suppliers as allies, winning emergencies.
- **Maintenance register** and **photo hose checks** ideas, which became M1–M4.

The build plan is [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)
(milestones M0–M7, PR #58, kept up to date since).

## 2. Features released

| PR | Milestone | What it does |
|----|-----------|--------------|
| #57 | — | Roadmap: costs, break-even, monetisation, retention ideas |
| #58 | M0 | Groundwork: routing for email links, security fix in dependencies, the implementation plan |
| #59 | M1 | **Maintenance register** — customers sign in and record their machines, each hose (spec) and a service log |
| #60 | M2 | **Jobs ↔ register** — quote for a machine, completed jobs are written into its register, "Order again" and "Save to a machine" on past requests, register links in the job-complete email |
| #61 | M3 | **Photo uploads** — customers attach up to 3 photos to a quote request (compressed, private storage, suppliers can view) |
| #62 | M4a | **Photo hose checks** — weekly-style check of a machine's hoses with a condition and photo per hose; history per hose; "N hoses need replacing" → quote in one tap |
| #63 | M4b | **Supplier hose audits** — customers book an audit, suppliers create one for any customer, inspect and photograph every hose with a condition and recommendation; flat + per-machine audit fee in supplier pricing |
| #64 | — | **Admin Audits tab** with full editing; admin can add audited hoses |
| #65 | M4c-1 | **Audit report** — "Mark audit complete & email report", customer report page that works without an account (`/a/…`), results written into the customer's register (machines, hoses, hose checks with photos, inspection log) |
| #66 | M4c-2 | **Quote from an audit** — supplier ticks the hoses to replace, quotes hose assemblies only (pickup/delivery) or on-site installation (callout, travel, labour); customer accepts as normal; completing the job updates every machine's register |
| #67 | M6 + fix | **Commission tracking** — HoseQuote's fee per job (default 8%, min $5, max $50), admin Commission tab (monthly totals, CSV export, mark invoiced, waive, supplier rates), fee shown to suppliers. Plus: machine log shows the full job price including on-site costs |
| #68 | — | Home screen: My Machines card matches the other cards; demo-reset scripts saved |
| #69 | — | This session summary |
| #70 | — | **Phone navigation** — on phones the header is just the logo and a labelled bottom tab bar (Home · Machines · Requests · Account, plus Supplier for suppliers/admins) replaces the row of small icons; new Account page (signed-in email, Supplier portal, Sign out). Laptop/desktop unchanged |
| #71 | — | Hose audit wording — the supplier "checks the hoses, photographs any of concern, and recommends" what to replace (no longer promises every hose) |

## 3. Database changes (all applied to staging and production)

| Migration | Adds |
|-----------|------|
| 0012 | Machines, machine hoses, service log |
| 0013 | Requests linked to a machine; completed job → register |
| 0014 | Request photos; private `photos` storage bucket |
| 0015 | Hose checks |
| 0016 | Hose audits, audited hoses, audit fees, `book_audit()` |
| 0017 | Admin editing of audits; audit photos visible to the customer |
| 0018 | Audit report sent date; completed audit → register |
| 0019 | Quote from audit (`create_quote_from_audit()`); multi-machine jobs → register; quote page shows what's quoted |
| 0020 | Machine log shows the full job price |
| 0021 | Commission: `supplier_commission`, `commissions` (admin + own supplier only) |

Check any time with [`supabase/checks/schema_check.sql`](../supabase/checks/schema_check.sql)
(paste into the SQL editor, every row should read `true`; 22 rows).

## 4. Supabase Edge Functions (production)

- **`notify`** — redeployed twice (register links in emails; audit quotes and
  on-site totals).
- **`audit-report`** — new: report page data and "email report". Deployed
  with *Enforce JWT verification* **off**. Two stray copies created while
  deploying (`super-handler`, `swift-worker`) were deleted.

## 5. Other work tonight

- **Live checks**: audit report email + register sync, quote-from-audit and
  job completion were tested on the live site and confirmed working.
- **Demo reset**: all old activity was wiped from production (quotes, jobs,
  audits, machines, checks, commission records and photos) so demos start
  clean. Suppliers, pricing, fee rates, admin access and logins were kept.
  Scripts to do it again: [`supabase/scripts/`](../supabase/scripts/) —
  `1-preview-demo-wipe.sql` (read-only) then `2-wipe-demo-data.sql`, then
  delete the folders under Storage → photos.
- **Safety nets added**: the CI security check (`scripts/rls-check.mjs`) now
  also proves anonymous visitors can't read or write machines, checks,
  audits, photos or commission data, and can't book audits or create quotes
  from them.

## 6. Decisions made

- Customers must sign in to use the maintenance register.
- Audits: booked by customers or created by suppliers; flat fee (+ optional
  per-machine fee) paid to the supplier directly; supplier quotes from the
  audit; results as an emailed report link plus the customer's register.
- Commission: 8% / min $5 / max $50 per job, on the job value including
  on-site costs; jobs accepted before commission started are free; nothing
  is charged automatically — invoiced monthly by hand from the CSV.
- Database changes are applied by the owner in the Supabase SQL editor
  (staging first, then production), then checked with `schema_check.sql`.

## 7. Parked for later

- **M5 — Reminders** (weekly hose-check / service-due emails). Upgrade Resend
  from the free 100-emails/day plan first.
- **M7 ideas** — QR stickers for one-tap re-orders, PDF export of a
  machine's history, Stripe invoicing for commission, fleet accounts.

## 8. Owner to-dos

- Tell suppliers about the HoseQuote fee before charging it — or set their
  rate to 0% in Admin → Commission until you're ready.
- Before real volume: Resend paid plan + own sending domain, Supabase Pro
  (free projects pause after inactivity — staging paused once tonight),
  Vercel Pro for commercial use, a privacy policy (the app stores customer
  details and photos).
