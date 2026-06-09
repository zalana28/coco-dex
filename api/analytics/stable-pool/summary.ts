import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getNotConfiguredPayload, getSupabaseAdmin, isSupabaseConfigured } from '../../_lib/supabaseAdmin.js'
import { getStablePoolSummary } from '../../_lib/stablePoolAnalyticsQueries.js'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!isSupabaseConfigured()) {
    return res.status(200).json(getNotConfiguredPayload())
  }

  try {
    const supabase = getSupabaseAdmin()
    const summary = await getStablePoolSummary(supabase)
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
    return res.status(200).json(summary)
  } catch (error) {
    console.error('Stable pool summary error:', error)
    return res.status(500).json({ status: 'error', error: 'Failed to fetch stable pool summary' })
  }
}
