# Phase 1 — Automated email notifications

Transactional emails to customer + supplier on request/quote lifecycle events,
each with a link back to the app. No auth or schema lock-down yet (that's Phase 2/3).

## What's in the repo

| Path | Purpose |
|---|---|
| `supabase/migrations/0001_add_request_access_token.sql` | Adds `requests.access_token` for tokenised email links |
| `supabase/functions/notify/index.ts` | Edge Function — receives DB webhooks, sends email via Resend |
| `supabase/config.toml` | CLI config (`verify_jwt = false` for `notify`) |
| `src/RequestStatus.tsx` | Read-only `/r/:id?t=token` view opened from customer emails |
| `src/main.tsx` | Routes `/r/:id` to that view |
| `vercel.json` | SPA rewrite so deep links resolve to `index.html` |
| `.env` / `.env.example` | Supabase config now read from `import.meta.env` |

## One-time setup

### 1. Resend
1. Sign up at https://resend.com, create an API key.
2. **No domain yet:** use sender `onboarding@resend.dev`. Resend will only
   deliver those to the email address on your own Resend account — fine for
   testing. Add + verify a domain later to email real customers/suppliers.

### 2. Supabase CLI
```bash
npm i -g supabase
supabase login
supabase link --project-ref qwycavfmdpknnflxlylw
```

### 3. Run the migration
```bash
supabase db push
```
(or paste the SQL from `0001_add_request_access_token.sql` into the dashboard SQL editor.)

### 4. Set function secrets
```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxxxxx \
  APP_URL=https://YOUR-PROJECT.vercel.app \
  EMAIL_FROM="HoseQuote <onboarding@resend.dev>"
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — don't set them.

### 5. Deploy the function
```bash
supabase functions deploy notify
```
Function URL: `https://qwycavfmdpknnflxlylw.functions.supabase.co/notify`

### 6. Create the Database Webhooks
Dashboard → **Database → Webhooks → Create a new hook** (do this twice):

| Name | Table | Events | Type | URL |
|---|---|---|---|---|
| `requests_insert` | `requests` | Insert | Supabase Edge Functions → `notify` | (auto) |
| `quotes_changes` | `quotes` | Insert, Update | Supabase Edge Functions → `notify` | (auto) |

No custom headers needed (`notify` is deployed with `verify_jwt = false`).

### 7. Vercel env vars
Project → Settings → Environment Variables (Production + Preview):
```
VITE_SUPABASE_URL      = https://qwycavfmdpknnflxlylw.supabase.co
VITE_SUPABASE_ANON_KEY = sb_publishable_omCeR7NRSVq6zIoqcGi3Aw_d9L-IWno
```
Redeploy after adding them.

## Testing

- **Local:** `npm run dev`, submit a request. The webhook only fires from the
  hosted DB, so to see email locally run `supabase functions serve notify` and
  temporarily point a webhook at your tunnel, or just test on the deployed app.
- **Function logs:** `supabase functions logs notify` (or the dashboard). With
  `RESEND_API_KEY` unset the function logs "would have emailed …" instead of sending.
- **Deep link:** after a request exists, open
  `https://YOUR-PROJECT.vercel.app/r/<REQUEST_ID>?t=<access_token>`.

## Events → emails

| DB change | Customer | Supplier |
|---|---|---|
| `requests` INSERT | "We've received your request" + track link | "New request" + portal link |
| `quotes` status → `confirmed` | "Your quote is ready" + accept link | — |
| `quotes` status → `rejected` | "Supplier can't take the job" | — |
| `quotes` status → `accepted` | "Booking confirmed" + supplier contact | "Quote accepted" + customer contact |
| `quotes` status → `completed` | "Job complete" | — |

Field-service sub-status emails are not wired yet — add cases in
`onQuoteStatusChange` / a `field_service` diff when needed.

## Known follow-ups (later phases)

- The publishable key is in git history. Rotate it when RLS lands (Phase 3).
- `/r/:id` reads `requests`/`quotes` with the anon key directly. When RLS is
  enabled, move that read into a `public-request` Edge Function that checks the
  token with the service role.
- Supabase Auth email templates (magic link, etc.) are configured in Phase 2.
