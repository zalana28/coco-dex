/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNetworkGuard } from './useNetworkGuard'

const wagmiMocks = vi.hoisted(() => ({
  switchChain: vi.fn(),
  switchChainAsync: vi.fn(),
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  useSwitchChain: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useAccount: wagmiMocks.useAccount,
  useChainId: wagmiMocks.useChainId,
  useSwitchChain: wagmiMocks.useSwitchChain,
}))

describe('useNetworkGuard', () => {
  const request = vi.fn()

  beforeEach(() => {
    wagmiMocks.switchChain.mockReset()
    wagmiMocks.switchChainAsync.mockReset()
    wagmiMocks.useAccount.mockReturnValue({ isConnected: true })
    wagmiMocks.useChainId.mockReturnValue(1)
    wagmiMocks.useSwitchChain.mockReturnValue({
      switchChain: wagmiMocks.switchChain,
      switchChainAsync: wagmiMocks.switchChainAsync,
      isPending: false,
      error: null,
    })
    request.mockReset()

    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: { request },
    })
  })

  it('adds Arc Testnet when the wallet reports an unknown chain', async () => {
    wagmiMocks.switchChainAsync
      .mockRejectedValueOnce(Object.assign(new Error('Unrecognized chain ID'), { code: 4902 }))
      .mockResolvedValueOnce(undefined)
    request.mockResolvedValue(undefined)

    const { result } = renderHook(() => useNetworkGuard())

    await act(async () => {
      await result.current.switchToArc()
    })

    expect(request).toHaveBeenCalledWith({
      method: 'wallet_addEthereumChain',
      params: [
        expect.objectContaining({
          chainId: '0x4cef52',
          chainName: 'Arc Testnet',
          rpcUrls: ['https://rpc.testnet.arc.network'],
        }),
      ],
    })
    expect(wagmiMocks.switchChainAsync).toHaveBeenCalledTimes(2)
    expect(result.current.switchState).toBe('success')
  })
})
