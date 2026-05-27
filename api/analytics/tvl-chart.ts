import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getTvlChart } from '../_lib/analyticsQueries.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const range = (req.query.range as string) || '7d'
    const supabase = getSupabaseAdmin()
    const chart = await getTvlChart(supabase, range)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
    return res.status(200).json(chart)
  } catch (error) {
    console.error('TVL chart error:', error)
    return res.status(500).json({ error: 'Failed to fetch TVL chart' })
  }
}
