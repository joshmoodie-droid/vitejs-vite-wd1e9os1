# Staging Supabase project

CI and (once wired) Vercel preview deploys run against a **staging** Supabase
project so they never touch production data.

| | Production | Staging |
|---|---|---|
| Name | `HoseQuote` | `HoseQuote-staging` |
| Ref | `qwycavfmdpknnflxlylw` | `qliapjpxwlcnyjfwfdor` |
| URL | `https://qwycavfmdpknnflxlylw.supabase.co` | `https://qliapjpxwlcnyjfwfdor.supabase.co` |
| Region | `ap-southeast-1` | `ap-northeast-1` |
| Used by | the live site (`www.hosequote.com.au`), Vercel **Production** | GitHub Actions CI, Vercel **Preview** / **Development** |

Staging has **no** Auth SMTP, edge functions, or webhooks configured — it only
needs the schema + a little seed data for the build, smoke tests and RLS test.
It must never be able to send email.

## How staging was built

1. `supabase/migrations/0000_baseline.sql` — a full snapshot of the prod `public`
   schema (tables, indexes, functions, RLS policies, grants, the
   `on_auth_user_created` trigger), captured by introspection. Migrations
   0001–0009 are already folded in. The `notify_requests` / `notify_quotes`
   webhook triggers are deliberately left out.
2. `supabase/seed.sql` — the two demo suppliers and their pricing, copied from
   prod.

Applied with:

```bash
npx supabase login --token <personal access token from supabase.com/dashboard/account/tokens>
npx supabase link --project-ref qliapjpxwlcnyjfwfdor
npx supabase db query --linked -f supabase/migrations/0000_baseline.sql
npx supabase db query --linked -f supabase/seed.sql
npx supabase link --project-ref qwycavfmdpknnflxlylw   # re-link to prod
```

(`db query --linked` runs over the Management API — no Docker, no database
password.)

## Keeping the two in sync

There is no `supabase db push` workflow here — schema changes are applied by
hand. When you write a new `supabase/migrations/00NN_*.sql`, **run it against
both projects**:

```bash
npx supabase link --project-ref qliapjpxwlcnyjfwfdor
npx supabase db query --linked -f supabase/migrations/00NN_whatever.sql
npx supabase link --project-ref qwycavfmdpknnflxlylw
npx supabase db query --linked -f supabase/migrations/00NN_whatever.sql
```

…or just paste it into each project's SQL editor.

## Rotating the staging key

The staging publishable key (`sb_publishable_Fslek…`) is committed in
`.github/workflows/ci.yml` — it's public by design, RLS is the boundary. If you
ever rotate it, update it there and in the Vercel Preview/Development env vars.
