# HoseQuote — business roadmap & future ideas

A parking spot for monetisation and retention ideas so they aren't lost. Nothing
here is built yet unless marked. Prices are list prices at time of writing (Oct
2026) — re-check vendor pricing pages before budgeting.

---

## 1. Running costs (once the app is charging money)

Current stack: Vercel (hosting) · Supabase (DB + auth, prod + staging) · Resend
(email) · Sentry (errors) · GitHub Actions (CI) · `hosequote.com.au`.

**Must-change items when commercial**

- **Vercel Hobby → Pro** (~US$20/mo per seat) — Hobby forbids commercial use.
- **Supabase Free → Pro** (US$25/mo, includes US$10 compute credit) — free
  projects pause when idle, have no backups, 500 MB cap. Keep staging in a
  separate free org to avoid ~US$10/mo extra compute.
- **Resend** — free tier is 3,000/mo but **100/day**. Each request sends ~2
  emails + 1–2 per status change, so the cap is ~25–30 requests/day. Pro is
  US$20/mo for 50k. Verify the domain so mail comes from `@hosequote.com.au`.

| Item | Launch | Growing |
|---|---|---|
| Vercel Pro | $20 | $20 |
| Supabase Pro (prod) | $25 | $40 (bigger compute) |
| Supabase staging | $0 | $0–10 |
| Resend | $0 | $20 |
| Sentry | $0 (Developer) | $26 (Team) |
| GitHub Actions | $0 | $0 |
| Business email | optional | ~A$10/user |
| **Total (USD)** | **~$45/mo ≈ A$70** | **~$110–120/mo ≈ A$170–190** |

**Annual / one-off (AUD):** domain ~$15–30/yr · ASIC business name ~$45/yr
(~$105/3 yr) · public liability / PI insurance ~$500–1,500/yr · privacy policy +
T&Cs $0–300+ · accountant/BAS varies. GST registration required at A$75k/yr
turnover.

---

## 2. Break-even — A$49/month supplier subscription

| Per supplier | A$/mo |
|---|---|
| Subscription | 49.00 |
| Stripe card fee (1.7% + 30c) | −1.13 |
| Stripe Billing (0.7%) | −0.34 |
| **Net** | **≈ 47.53** |

Fixed costs: **Lean ≈ A$159/mo** (infra 70 + insurance/domain/ASIC 89) ·
**Growing ≈ A$369/mo** (infra 180 + 89 + accountant 100).

- Break-even: **4 suppliers** (lean) / **8 suppliers** (growing).

| Suppliers | Profit/mo | Profit/yr |
|---|---|---|
| 10 | +106 | +1,280 |
| 25 | +819 | +9,830 |
| 50 | +1,990 | +23,900 |
| 100 | +4,350 | +52,200 |

Notes: GST threshold ≈ 127 suppliers (after that A$49 inc-GST nets ~A$43.10,
or move to A$49 + GST). Paying yourself A$5k/mo ≈ 113 suppliers. Budget for
3–5% monthly churn. Annual plan (e.g. A$490/yr) improves cash flow.

---

## 3. Monetisation options

Typical job value (seed pricing): workshop assembly ~A$210–270; field-service
~A$600; urgency multiplies travel 1.3× / 1.6×.

### Commission on jobs / hose assemblies
- % of accepted quote (8–12% → ~A$17–32 per workshop job).
- Flat per assembly (A$4–6) — computed from `requests.assemblies`.
- Flat per field-service callout (A$15–25).
- Hybrid: 10%, min A$5, cap A$50.

**Collecting it**
- *Option A — monthly invoice to suppliers*: use accepted/`completed_at` quotes,
  Stripe invoice. Cheap to build; relies on suppliers marking jobs complete.
- *Option B — Stripe Connect*: customer pays deposit/full in-app,
  `application_fee` taken automatically. Strong anti-leakage, more build, Connect
  per-account fees.

**Leakage risk** (repeat jobs bypassing the app): gate contact unlock behind a
deposit, make in-app reorder easier than a phone call, lower commission on
repeat jobs (e.g. 8% first job → 3% repeat). See section 4.

### Other supplier-side revenue
- **Pay-per-lead** — charge A$5–15 for the existing "unlock contact" step
  (`connections` table, `unlockContact` in `App.tsx`); emergency leads priced higher.
- **Tiered subscription** — Basic A$0 (commission) · Pro A$49 (0–3% commission)
  · Multi-branch A$99 (locations + staff logins).
- **Featured placement** — sponsored ranking, first look at emergency jobs (SMS), verified badge.
- **SaaS for off-platform work** — quote builder for walk-ins, branded PDF
  quotes, invoicing, Xero/MYOB sync (A$29–79/mo).

### Customer-side
- Booking/convenience fee A$3–5 (higher for emergency/after-hours), shown upfront.
- Fleet accounts A$99–499/mo — multiple users, consolidated invoicing, net-30 terms.
- Membership — priority response, no booking fees.

### Third-party
- Manufacturer/distributor sponsorship (Parker, Gates, Manuli…) and restock referral fees.
- Anonymised regional demand data for distributors.
- Later: job finance, warranty/insurance add-ons.

### Suggested sequence
1. Free to join + 8% commission (min A$5 / cap A$50), monthly invoicing (Option A).
2. At 5–10 active suppliers: A$49 Pro tier (0–3%) + featured emergency leads.
3. If leakage shows: Stripe Connect deposits, contact released after deposit.
4. Fleet accounts + maintenance register (section 5).

---

## 4. Customer retention — keep repeat jobs going through HoseQuote

Principle: be faster and easier than phoning the supplier, and own the data the
customer can't get elsewhere.

1. **Remember every hose** — save assemblies to a machine; "Order again"
   button on `MyRequests` and `/r/:id`; never re-measure.
2. **QR stickers & tags** — cab sticker "Hose burst? Scan to reorder"; QR tag on
   each hose fitted by the supplier; reorder routes back to the same supplier.
3. **Make suppliers allies** — lower commission on in-app reorders,
   supplier-branded reorder links for invoices/business cards.
4. **Win emergencies** — broadcast to all nearby suppliers, "open now"/ETA, SMS
   alerts, live "on the way" status, instant estimate (`calcEstimate`).
5. **Proactive reminders** — replacement/inspection due emails via `notify` +
   Resend; seasonal nudges (pre-harvest, pre-wet-season); post-job "save this
   hose" + rating email.
6. **Records only the app has** — job history, tax invoices, WHS maintenance
   logs, fleet accounts with net-30 terms.
7. **Trust & rewards** — HoseQuote guarantee on in-app jobs, loyalty credits
   (e.g. 5th callout free), referrals, saved payment method.
8. **Zero friction** — installable PWA, login-free tokenised reorder links,
   photo-first ordering ("snap the broken hose").

**Build order:** Order again + My machines → post-job follow-up email → QR cab
stickers → reminders → repeat-job commission discount → emergency broadcast/SMS
→ fleet accounts, guarantee, QR hose tags.

**Metrics:** repeat-customer rate, % of jobs from reorder/QR, time to first quote.

---

## 5. Maintenance register (priority add-on)

Many small business owners (earthmoving, farms, tradies, small fleets) keep no
maintenance records at all, or keep them on paper in the ute. A simple
per-machine register is useful on its own — and it makes HoseQuote the natural
place to order the next hose.

### What the customer gets
- **Machines** — name, make/model, year, serial/VIN, rego, hour meter /
  odometer, photo, site/location.
- **Hose register per machine** — position (e.g. "boom cylinder, left"), full
  spec (from the job's assembly), install date, supplier, link to the job, QR tag ID.
- **Service log** — any maintenance, not just hoses: hose replaced, inspection,
  service, oil/filter change, greasing, repair. Date, hours, notes, cost, who did
  it (self or supplier), photos and invoice attachments.
- **Automatic entries** — a completed HoseQuote job writes its own log entry
  and hose-register rows.
- **Reminders** — due by date or by hours (e.g. 250-hour service, annual hose
  inspection); email/SMS with one-tap "book it".
- **Export** — PDF/CSV per machine or fleet for insurance, WHS audits, finance
  and resale ("full service history" adds resale value).
- **QR cab sticker** — opens the machine's register and reorder screen.

### Why it matters commercially
- Daily/weekly use, not just when a hose bursts → habit and lock-in.
- Every reminder is a booking opportunity for a supplier (and commission).
- Natural paid tier: basic register free for all customers; **Business**
  (A$9–19/mo) adds multiple users, unlimited machines, attachments, exports,
  hour-based reminders; feeds into fleet accounts.
- Suppliers can be offered a view of (consented) customer registers to propose
  preventive replacements.

### Rough data model
```
machines        (id, customer_id, name, make, model, year, serial, rego,
                 hours, photo_url, site, qr_code, created_at)
machine_hoses   (id, machine_id, position, spec jsonb, installed_at,
                 supplier_id, request_id, quote_id, qr_code, replaced_at)
service_log     (id, machine_id, type, performed_at, hours, notes, cost,
                 performed_by, supplier_id, quote_id, attachments jsonb)
reminders       (id, machine_id, kind, due_at, due_hours, interval_days,
                 interval_hours, last_sent_at, done_at)
```
All rows scoped to `customer_id` with RLS, matching the existing pattern
(see `scripts/rls-check.mjs`). Reminder emails sent by a scheduled Edge
Function using the existing Resend setup.

### Phased build
1. Machines + manual service log + "save this job's hoses to a machine" on completed requests.
2. "Order again" from a saved hose; auto log entry on job completion.
3. Date-based reminders (scheduled Edge Function + email).
4. Hour-based reminders, attachments, PDF/CSV export.
5. QR cab stickers / hose tags; paid Business tier; multi-user fleet accounts.

---

## 6. Photo-based hose checks → jobs

Today a request only takes a pasted "Photo URL" text field (`flows.tsx`) — no
real upload. Idea: make the camera the main way in.

### Flow
1. **Snap** — customer opens the app on site, taps "Check a hose", takes 1–3
   photos (whole hose, each fitting/crimp, the layline printing on the hose).
2. **Tag** — pick the machine + hose position from the maintenance register (or
   add new). Quick condition rating: OK / Watch / Replace soon / Leaking now.
3. **Decide** — "All good" saves it to the history. "Get a quote" turns the
   photos straight into a request: spec pre-filled from the register if the
   hose is known; otherwise the supplier identifies it from the photos.
   Customer picks urgency + when it suits (date/time window, workshop drop-off,
   pickup/delivery or on-site).

### Weekly / regular checks
- Reminder ("Weekly hose check — 3 machines") by email/push, schedule set by
  the customer.
- Guided checklist per machine: snap each tagged hose, tick condition.
- **Timeline per hose** — photos side by side over weeks to spot wear
  developing (abrasion, cracking, bulging, weeping at fittings, kinks).
- Doubles as a **pre-start / safety inspection record** (WHS evidence),
  exportable with the maintenance register.

### Helpers
- Photo tips overlay: include a tape measure, photo the layline text and both
  fittings → suppliers can quote without a site visit.
- Optional AI assist (later): read layline text, suggest hose type/bore and
  fitting type, flag visible wear. Advisory only — "a supplier should inspect",
  never a safety sign-off.
- Supplier side: photos shown in the request; supplier can reply "looks fine
  for now, re-check in 4 weeks" or quote.

### Commercial angle
- Weekly habit → customers open the app when nothing is broken.
- "Replace soon" photos become planned jobs (cheaper for customer, booked
  workshop time for supplier) instead of emergency callouts.
- Fits the paid Business tier (unlimited photo history, scheduled checks, export).

### Build notes
- Supabase Storage bucket, private, per-customer RLS; signed URLs for suppliers
  on a request.
- Compress client-side (~200–400 KB/photo). Pro includes 100 GB storage —
  ~250k+ photos.
- Table sketch: `hose_checks (id, machine_id, machine_hose_id, checked_at,
  condition, notes, photos jsonb, request_id)`.
- Mobile: `<input type="file" accept="image/*" capture="environment">` works in
  the browser/PWA without a native app.
