import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin'
import { getTokenData } from '../_lib/analyticsQueries'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const supabase = getSupabaseAdmin()
    const tokens = await getTokenData(supabase)
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
    return res.status(200).json(tokens)
  } catch (error) {
    console.error('Tokens error:', error)
    return res.status(500).json({ error: 'Failed to fetch tokens' })
  }
}
