export const EIP1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const
export const EIP1967_BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' as const
export const EIP1967_ADMIN_SLOT_CANONICAL = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as const
// Per explicit request, read the supplied admin slot too. It does not match the canonical ERC-1967
// admin slot above, so a divergence is recorded and treated as ambiguous/fail-closed.
export const EIP1967_ADMIN_SLOT_SUPPLIED = '0xb53127684a568b3173ae13b9f8a6016e019b3ec6a6e8ee1178d6a717850b5d6103' as const

export const PROXY_STATUSES = [
  'non-proxy-confirmed',
  'eip1967-implementation',
  'eip1967-beacon',
  'eip1167-minimal',
  'proxy-pattern-other',
  'unknown',
] as const
export type ProxyStatus = (typeof PROXY_STATUSES)[number]

export type ProxyResolution = {
  status: ProxyStatus
  implementationAddress?: `0x${string}`
  implementationRuntimeCodeHash?: `0x${string}`
  beaconAddress?: `0x${string}`
  beaconImplementationAddress?: `0x${string}`
  proxyAdminAddress?: `0x${string}`
  mutable: boolean
  readsFailed: boolean
  storageReadFailures?: string[]
  slotDivergence?: string
  warning?: string
}

export function parseAddressFromStorage(value: string): `0x${string}` | undefined {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('malformed storage value')
  const candidate = `0x${value.slice(-40).toLowerCase()}` as `0x${string}`
  return /^0x0{40}$/.test(candidate) ? undefined : candidate
}

export function detectProxyPattern(runtimeCode: string): { kind: 'eip1167-minimal' | 'delegatecall-forwarder' | 'none'; implementationAddress?: `0x${string}` } {
  if (runtimeCode === '0x') throw new Error('missing bytecode')
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(runtimeCode)) throw new Error('malformed bytecode')
  const code = runtimeCode.toLowerCase()
  const minimal = code.match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/)
  if (minimal?.[1]) return { kind: 'eip1167-minimal', implementationAddress: `0x${minimal[1]}` }
  let bytes = code.slice(2)
  if (bytes.length >= 4) {
    const metadataLengthBytes = Number.parseInt(bytes.slice(-4), 16)
    const trailerHexLength = (metadataLengthBytes + 2) * 2
    if (metadataLengthBytes > 0 && trailerHexLength <= bytes.length) bytes = bytes.slice(0, -trailerHexLength)
  }
  for (let offset = 0; offset < bytes.length; offset += 2) {
    const opcode = Number.parseInt(bytes.slice(offset, offset + 2), 16)
    if (opcode === 0xf4 && bytes.length / 2 <= 512) return { kind: 'delegatecall-forwarder' }
    if (opcode >= 0x60 && opcode <= 0x7f) offset += (opcode - 0x5f) * 2
  }
  return { kind: 'none' }
}

export function slotReadFailure(reason: string): never {
  throw new Error(reason)
}
