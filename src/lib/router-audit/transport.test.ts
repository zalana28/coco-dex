import { describe, expect, it, vi } from 'vitest'
import { createReadOnlyRpcTransport, READ_ONLY_RPC_METHODS } from './transport'

describe('read-only router audit RPC transport', () => {
  it('contains only the documented read-only method allowlist', () => {
    expect([...READ_ONLY_RPC_METHODS]).toEqual([
      'eth_chainId',
      'eth_blockNumber',
      'eth_getBlockByNumber',
      'eth_getCode',
      'eth_getStorageAt',
      'eth_call',
      'eth_estimateGas',
    ])
  })

  it.each([
    'eth_sendTransaction',
    'eth_sendRawTransaction',
    'personal_sendTransaction',
    'eth_signTransaction',
    'wallet_sendTransaction',
    'wallet_addEthereumChain',
    'wallet_switchEthereumChain',
    'personal_unlockAccount',
    'eth_sign',
  ])('rejects broadcast, signing, wallet, and unlock method %s before network I/O', async (method) => {
    const fetchFn = vi.fn()
    const rpc = createReadOnlyRpcTransport('https://rpc.example.invalid/key?apiKey=secret', { fetchFn })
    await expect(rpc.request(method, [])).rejects.toThrow(/blocked RPC method/)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('redacts credentials and provider errors', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'failed at https://user:pass@rpc.example/a?key=secret /Users/alice/repo' } }),
    })
    const rpc = createReadOnlyRpcTransport('https://user:pass@rpc.example/a?key=secret', { fetchFn })
    await expect(rpc.request('eth_chainId', [])).rejects.toThrow(/\[REDACTED_URL\].*\[REDACTED_PATH\]/)
  })

  it('sanitizes an operator-controlled provider label before storage or rendering', async () => {
    const rpc = createReadOnlyRpcTransport('https://rpc.example', {
      providerLabel: 'https://user:password@rpc.example/path?apiKey=SUPER_SECRET /Users/alice/private',
      fetchFn: vi.fn(),
    })
    expect(rpc.providerLabel).not.toMatch(/https?:|user:password|SUPER_SECRET|\/Users\//)
    expect(rpc.providerLabel).toContain('[REDACTED_URL]')
  })

  it('never logs the RPC URL or authorization values', async () => {
    const logger = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x4cef52' }) })
    const rpc = createReadOnlyRpcTransport('https://rpc.example/a?apiKey=secret', {
      fetchFn,
      logger,
      headers: { Authorization: 'Bearer hidden' },
      providerLabel: 'operator-supplied Arc RPC',
    })
    expect(await rpc.request('eth_chainId', [])).toBe('0x4cef52')
    expect(JSON.stringify(logger.mock.calls)).not.toContain('secret')
    expect(JSON.stringify(logger.mock.calls)).not.toContain('hidden')
    expect(JSON.stringify(logger.mock.calls)).toContain('operator-supplied Arc RPC')
  })

  it('retries transient 429 responses without changing request parameters', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 2, result: '0x6000' }) })
    const rpc = createReadOnlyRpcTransport('https://rpc.example', { fetchFn, fixedBlockTag: '0x123', retryDelayMs: 0 })
    expect(await rpc.request('eth_getCode', ['0x0000000000000000000000000000000000000001', '0x123'])).toBe('0x6000')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(fetchFn.mock.calls[0]?.[1].body).toBe(fetchFn.mock.calls[1]?.[1].body)
  })
})


describe('fixed block discipline', () => {
  it('rejects missing or latest block tags for state reads', async () => {
    const fetchFn = vi.fn()
    const rpc = createReadOnlyRpcTransport('https://rpc.example', { fetchFn, fixedBlockTag: '0x123' })
    await expect(rpc.request('eth_getCode', ['0x0000000000000000000000000000000000000001', 'latest'])).rejects.toThrow(/fixed audit block/)
    await expect(rpc.request('eth_call', [{ to: '0x0000000000000000000000000000000000000001', data: '0x' }])).rejects.toThrow(/fixed audit block/)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('allows the selected fixed block for compatible reads', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x6000' }) })
    const rpc = createReadOnlyRpcTransport('https://rpc.example', { fetchFn, fixedBlockTag: '0x123' })
    expect(await rpc.request('eth_getCode', ['0x0000000000000000000000000000000000000001', '0x123'])).toBe('0x6000')
  })
})
