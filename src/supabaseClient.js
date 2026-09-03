import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qwycavfmdpknnflxlylw.supabase.co'
const supabaseKey = 'sb_publishable_omCeR7NRSVq6zIoqcGi3Aw_d9L-IWno'

export const supabase = createClient(supabaseUrl, supabaseKey)