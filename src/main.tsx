import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/config/wagmi'
import { validateContractConfig } from '@/lib/router/contractVerification'
import { quoteRetryDelay, shouldRetryQuote } from '@/lib/router/quoteQueryOptions'
import App from '@/App'
import './index.css'

// Validate all contract addresses and chain config at startup.
// Throws in dev if anything is misconfigured; logs a warning in production.
validateContractConfig()

/**
 * Defaults matter more than they look: every query that does not set its own
 * options inherits them, which on Arc Testnet means the balance, allowance and
 * reserve reads. React Query's stock defaults (`staleTime: 0`, `retry: 3`,
 * refetch-on-focus) are tuned for cheap APIs, not for a rate-limited public RPC
 * — they were a large share of the 429s seen during approve + swap.
 *
 * Individual quote reads still override these; see
 * `src/lib/router/quoteQueryOptions.ts`.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a reverted call or a bad argument fails identically and only
      // adds load, so retry transient RPC failures only, with real backoff.
      retry: shouldRetryQuote,
      retryDelay: quoteRetryDelay,
      // Treat chain reads as fresh for a block or two rather than refetching on
      // every mount.
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
