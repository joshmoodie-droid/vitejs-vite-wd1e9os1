import { createClient } from '@supabase/supabase-js'

// Prefer env vars (Vercel project settings / local .env). Fall back to the
// values that were previously hardcoded here so existing deploys keep working
// even before the Vercel env vars are added. These are the *publishable*
// Supabase credentials — designed to ship in the browser bundle — and are
// already public in this repo's history. Phase 3 (RLS) will rotate the key
// and drop this fallback.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://qwycavfmdpknnflxlylw.supabase.co'
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_omCeR7NRSVq6zIoqcGi3Aw_d9L-IWno'

export const supabase = createClient(supabaseUrl, supabaseKey)
