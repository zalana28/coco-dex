import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getNotConfiguredPayload, getSupabaseAdmin, isSupabaseConfigured } from '../../_lib/supabaseAdmin.js'
import { getStablePoolEvents } from '../../_lib/stablePoolAnalyticsQueries.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSupabaseConfigured()) {
    return res.status(200).json(getNotConfiguredPayload())
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const supabase = getSupabaseAdmin()
    const events = await getStablePoolEvents(supabase, limit)
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30')
    return res.status(200).json(events)
  } catch (error) {
    console.error('Stable pool events error:', error)
    return res.status(500).json({ status: 'error', error: 'Failed to fetch stable pool events' })
  }
}
