import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getNotConfiguredPayload, getSupabaseAdmin, isSupabaseConfigured } from '../../_lib/supabaseAdmin.js'
import { getStablePoolReserves } from '../../_lib/stablePoolAnalyticsQueries.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSupabaseConfigured()) {
    return res.status(200).json(getNotConfiguredPayload())
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 24, 100)
    const supabase = getSupabaseAdmin()
    const reserves = await getStablePoolReserves(supabase, limit)
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
    return res.status(200).json(reserves)
  } catch (error) {
    console.error('Stable pool reserves error:', error)
    return res.status(500).json({ status: 'error', error: 'Failed to fetch stable pool reserves' })
  }
}
