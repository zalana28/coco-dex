import type { Token } from '@/types/token'

export const USDC: Token = {
  address: '0x3600000000000000000000000000000000000000',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  logoColor: '#2775CA',
}

export const EURC: Token = {
  address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  symbol: 'EURC',
  name: 'Euro Coin',
  decimals: 6,
  logoColor: '#1434CB',
}

export const TOKEN_LIST: Token[] = [USDC, EURC]

export const DEFAULT_FROM_TOKEN = USDC
export const DEFAULT_TO_TOKEN = EURC
