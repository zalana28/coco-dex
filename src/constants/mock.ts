export const MOCK_PROTOCOL_STATS = {
  tvl: 4_250_000,
  volume24h: 1_890_000,
  totalFees: 5_670,
  totalTrades: 12_450,
}

export const MOCK_POOLS = [
  {
    id: '0x001',
    token0: 'USDC',
    token1: 'EURC',
    tvl: 2_400_000,
    volume24h: 890_000,
    apr: 12.4,
    feeTier: 0.3,
    reserve0: 1_200_000,
    reserve1: 1_104_000,
  },
]

export const MOCK_TOP_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    price: 1.0,
    change24h: 0.0,
    volume24h: 1_200_000,
    tvl: 2_100_000,
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    price: 1.086,
    change24h: 0.12,
    volume24h: 980_000,
    tvl: 2_050_000,
  },
]

export const MOCK_USER_POSITIONS = [
  {
    poolId: '0x001',
    token0: 'USDC',
    token1: 'EURC',
    lpBalance: 1200,
    share: 0.05,
    value: 1200,
    token0Amount: 600,
    token1Amount: 552,
  },
]

// Mock exchange rate: 1 USDC = 0.92 EURC
export const MOCK_EXCHANGE_RATE = 0.92
