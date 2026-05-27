import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin'
import { getRecentActivity } from '../_lib/analyticsQueries'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const supabase = getSupabaseAdmin()
    const activity = await getRecentActivity(supabase, limit)
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30')
    return res.status(200).json(activity)
  } catch (error) {
    console.error('Activity error:', error)
    return res.status(500).json({ error: 'Failed to fetch activity' })
  }
}
