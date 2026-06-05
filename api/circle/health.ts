import type { VercelRequest, VercelResponse } from '@vercel/node'

const DEFAULT_CIRCLE_BASE_URL = 'https://api.circle.com'
const WALLETS_PATH = '/v1/w3s/wallets'

function getCircleEndpoint() {
  const baseUrl = process.env.CIRCLE_BASE_URL || DEFAULT_CIRCLE_BASE_URL
  return `${baseUrl.replace(/\/+$/, '')}${WALLETS_PATH}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      ok: false,
      configured: Boolean(process.env.CIRCLE_API_KEY),
      endpoint: getCircleEndpoint(),
      message: 'Method not allowed.',
      timestamp: new Date().toISOString(),
    })
  }

  const apiKey = process.env.CIRCLE_API_KEY

  if (!apiKey) {
    return res.status(200).json({
      ok: false,
      configured: false,
      message: 'Circle API key is not configured.',
    })
  }

  const endpoint = getCircleEndpoint()

  try {
    const circleResponse = await fetch(endpoint, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
    })

    if (circleResponse.status === 200) {
      return res.status(200).json({
        ok: true,
        configured: true,
        circleStatus: circleResponse.status,
        endpoint,
        message: 'Circle API key verified with Circle Wallets endpoint.',
        timestamp: new Date().toISOString(),
      })
    }

    if (circleResponse.status === 401) {
      return res.status(200).json({
        ok: false,
        configured: true,
        circleStatus: circleResponse.status,
        endpoint,
        message: 'Circle API key is invalid or malformed.',
        timestamp: new Date().toISOString(),
      })
    }

    return res.status(200).json({
      ok: false,
      configured: true,
      circleStatus: circleResponse.status,
      endpoint,
      message: 'Circle API key is configured but Circle returned a non-200 response.',
      timestamp: new Date().toISOString(),
    })
  } catch {
    return res.status(200).json({
      ok: false,
      configured: true,
      endpoint,
      message: 'Could not reach Circle API.',
      timestamp: new Date().toISOString(),
    })
  }
}
