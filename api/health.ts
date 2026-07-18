import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { getArcClient } from './_lib/arcClient.js'
import { servePublicVersion } from './_lib/publicVersion.js'

/**
 * Health check endpoint for Coco DEX indexer status.
 * Returns chain/indexer state without exposing secrets.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query.publicVersion === '1') return servePublicVersion(req, res)

  try {
    const supabase = getSupabaseAdmin()
    const client = getArcClient()

    const [latestBlock, { data: state }] = await Promise.all([
      client.getBlockNumber(),
      supabase
        .from('indexer_state')
        .select('last_indexed_block, updated_at')
        .eq('id', 'arc_testnet')
        .single(),
    ])

    const lastIndexedBlock = Number(state?.last_indexed_block ?? 0)
    const lagBlocks = Number(latestBlock) - lastIndexedBlock

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
    return res.status(200).json({
      ok: true,
      chainId: 5042002,
      latestBlock: Number(latestBlock),
      lastIndexedBlock,
      lagBlocks,
      supabase: 'ok',
      lastSyncedAt: state?.updated_at ?? null,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    console.error('Health check error:', error)
    return res.status(500).json({
      ok: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    })
  }
}
