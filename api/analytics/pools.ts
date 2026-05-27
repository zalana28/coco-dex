import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getPoolData } from '../_lib/analyticsQueries.js'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const supabase = getSupabaseAdmin()
    const pool = await getPoolData(supabase)
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
    return res.status(200).json([pool])
  } catch (error) {
    console.error('Pools error:', error)
    return res.status(500).json({ error: 'Failed to fetch pools' })
  }
}
