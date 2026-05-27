import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client using service role key.
 * NEVER import this from frontend code.
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
