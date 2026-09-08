import { createClient } from '@supabase/supabase-js'

// Config comes from env vars: `.env` for local dev (gitignored), Vercel
// Project → Settings → Environment Variables for deploys. See `.env.example`.
// The key here is the Supabase *publishable* key — designed to ship in the
// browser bundle; the security boundary is Row Level Security (see
// supabase/migrations/0006_phase3c_rls_lockdown.sql), not key secrecy.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env for local dev, or set them in the Vercel project settings.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
