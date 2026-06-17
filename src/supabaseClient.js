import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Returns null when env vars aren't configured — the duel overlay checks for
// this and shows a "not configured" message instead of crashing.
export const supabase = (url && key && !url.includes('your-project-id'))
  ? createClient(url, key)
  : null
