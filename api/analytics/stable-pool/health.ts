import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getNotConfiguredPayload, getSupabaseAdmin, isSupabaseConfigured } from '../../_lib/supabaseAdmin.js'
import { getStablePoolHealth } from '../../_lib/stablePoolAnalyticsQueries.js'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!isSupabaseConfigured()) {
    return res.status(200).json(getNotConfiguredPayload())
  }

  try {
    const supabase = getSupabaseAdmin()
    const health = await getStablePoolHealth(supabase)
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
    return res.status(200).json(health)
  } catch (error) {
    console.error('Stable pool health error:', error)
    return res.status(500).json({ status: 'error', error: 'Failed to fetch stable pool health' })
  }
}
