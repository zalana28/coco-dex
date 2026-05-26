# Coco DEX - Implementation Tasks

## Phase 1: App Shell & Pages (Mocked Data)

### Task 1.1: Project Scaffolding
- [ ] Initialize Vite + React + TypeScript project
- [ ] Install dependencies: tailwindcss, react-router-dom, wagmi, viem, @tanstack/react-query
- [ ] Configure Tailwind with custom Coco DEX theme (colors, fonts, spacing)
- [ ] Set up project structure: src/{components, pages, hooks, config, utils, constants, types}
- [ ] Configure path aliases (@/ → src/)

### Task 1.2: Design System Foundation
- [ ] Create Tailwind config with full Coco color palette
- [ ] Add Inter + JetBrains Mono fonts
- [ ] Create base component primitives: Button, Card, Input, Badge
- [ ] Set up dark mode as default (class strategy)

### Task 1.3: App Shell & Routing
- [ ] Create root layout with NavigationBar and main content area
- [ ] Implement NavigationBar with logo, nav links, wallet connect button placeholder
- [ ] Set up React Router with routes: /, /swap, /pools, /analytics
- [ ] Add 404 fallback page

### Task 1.4: Landing Page
- [ ] Hero section with headline, subtext, CTA button
- [ ] Stats bar with mocked TVL, Volume, Trades numbers
- [ ] Feature cards section (Low fees, Deep liquidity, Instant settlement)
- [ ] Footer with links

### Task 1.5: Swap Page (Static)
- [ ] Swap card layout with From/To token input sections
- [ ] Token selector component (static, USDC/EURC)
- [ ] Amount input with formatting
- [ ] Swap direction toggle button
- [ ] Swap button (Connect Wallet state)
- [ ] Price info section placeholder

### Task 1.6: Pools Page (Static)
- [ ] Pool list with mocked pool data (USDC/EURC)
- [ ] Pool card component showing TVL, volume, APR
- [ ] "Add Liquidity" button placeholder
- [ ] "My Positions" tab with empty state

### Task 1.7: Analytics Page (Static)
- [ ] Metric cards: TVL, 24h Volume, Fees, Transactions
- [ ] Top Pools table with sortable columns (mocked)
- [ ] Top Tokens table (mocked)
- [ ] Chart placeholder area

## Phase 2: Arc Testnet Chain Configuration

### Task 2.1: Chain Definition
- [ ] Define Arc Testnet chain using viem's `defineChain`
- [ ] Configure: chainId 5042002, RPC, explorer, native currency (USDC, 6 decimals)
- [ ] Export chain config from src/config/chains.ts

### Task 2.2: Wagmi Configuration
- [ ] Create wagmi config with Arc Testnet chain
- [ ] Set up WagmiProvider + QueryClientProvider in app root
- [ ] Configure connectors: injected (MetaMask), walletConnect (optional)

### Task 2.3: Wallet Connect UI
- [ ] Implement ConnectWalletButton component
- [ ] States: disconnected, connecting, connected (show address), wrong network
- [ ] Network switch prompt when on wrong chain
- [ ] Disconnect option in dropdown

## Phase 3: Token Configuration

### Task 3.1: Token Registry
- [ ] Define Token type: { address, symbol, name, decimals, logoURI }
- [ ] Create token list: USDC (0x360...000), EURC (0x89B...72a)
- [ ] Token logos (use placeholder SVGs or simple colored circles)
- [ ] Export from src/config/tokens.ts

### Task 3.2: Token Balance Hooks
- [ ] Create useTokenBalance hook using wagmi's useReadContract
- [ ] Format balances with proper decimal handling (6 decimals)
- [ ] Create useTokenAllowance hook for approval checks

## Phase 4: Polished Swap UI

### Task 4.1: Token Input Component
- [ ] Refine token input with real balance display
- [ ] MAX button to fill with full balance
- [ ] USD value display below amount
- [ ] Token selector modal with search

### Task 4.2: Swap Logic & State
- [ ] Swap state management (from token, to token, amounts, direction)
- [ ] Price calculation utility (mocked constant product formula)
- [ ] Price impact calculation
- [ ] Minimum received based on slippage

### Task 4.3: Slippage Settings
- [ ] Settings popover/modal with slippage options
- [ ] Preset buttons: 0.1%, 0.5%, 1.0%
- [ ] Custom input with validation (0.01% - 50%)
- [ ] Persist in localStorage

### Task 4.4: Route Preview
- [ ] Display swap route (e.g., USDC → EURC)
- [ ] Price ratio display (1 USDC = X EURC)
- [ ] Price impact indicator with color coding
- [ ] Minimum received / Maximum sent
- [ ] Network fee estimate placeholder

### Task 4.5: Swap Button States
- [ ] Connect Wallet (when disconnected)
- [ ] Select Token (when token not chosen)
- [ ] Enter Amount (when amount is 0)
- [ ] Insufficient Balance (when amount > balance)
- [ ] Approve [Token] (when allowance insufficient)
- [ ] Swap (ready state)
- [ ] Swapping... (pending state with spinner)

### Task 4.6: Confirmation Modal
- [ ] Pre-swap confirmation with all details
- [ ] Transaction submitted state with explorer link
- [ ] Transaction confirmed state
- [ ] Transaction failed state with error message

## Phase 5: Pool UI

### Task 5.1: Pool List Enhancement
- [ ] Pool cards with real structure for USDC/EURC pair
- [ ] Search/filter functionality
- [ ] Sort by TVL, Volume, APR
- [ ] Responsive grid layout

### Task 5.2: Add Liquidity Screen
- [ ] Dual token input (both tokens required)
- [ ] Price and pool share preview
- [ ] "First liquidity provider" notice when pool is empty
- [ ] Supply button with proper states
- [ ] Confirmation modal

### Task 5.3: Remove Liquidity Screen
- [ ] Percentage selector: 25%, 50%, 75%, 100% + slider
- [ ] Display tokens to receive based on percentage
- [ ] Approve LP token step
- [ ] Remove button with states
- [ ] Confirmation modal

### Task 5.4: My Positions
- [ ] List user's LP positions
- [ ] Show pool share percentage
- [ ] Show underlying token amounts
- [ ] Quick actions: Add more, Remove
- [ ] Empty state when no positions

## Phase 6: Contract Integration Placeholders

### Task 6.1: Contract ABIs
- [ ] UniswapV2Factory ABI (createPair, getPair, allPairs)
- [ ] UniswapV2Router02 ABI (swapExactTokensForTokens, addLiquidity, removeLiquidity)
- [ ] UniswapV2Pair ABI (getReserves, token0, token1, totalSupply)
- [ ] ERC20 ABI (approve, allowance, balanceOf, transfer)

### Task 6.2: Contract Hooks
- [ ] useSwap hook (placeholder, no real address)
- [ ] useAddLiquidity hook (placeholder)
- [ ] useRemoveLiquidity hook (placeholder)
- [ ] useApprove hook for ERC20 token approval
- [ ] Clear TODO comments indicating where deployed addresses go

### Task 6.3: Price Utilities
- [ ] getAmountOut (constant product formula)
- [ ] getAmountIn (reverse calculation)
- [ ] calculatePriceImpact
- [ ] calculateMinimumReceived (with slippage)
- [ ] formatTokenAmount (6 decimal handling)

## Phase 7: Tests & Type Safety

### Task 7.1: Utility Tests
- [ ] Test price calculation utilities (getAmountOut, getAmountIn)
- [ ] Test formatTokenAmount with various inputs
- [ ] Test slippage calculations
- [ ] Test address validation

### Task 7.2: Type Checking
- [ ] Run tsc --noEmit to verify no type errors
- [ ] Ensure all components have proper prop types
- [ ] Verify contract ABI types are correct
- [ ] Check hook return types are well-defined

### Task 7.3: Component Tests (Optional)
- [ ] Swap card renders correctly
- [ ] Token input handles decimal inputs properly
- [ ] Button states change correctly
- [ ] Navigation routing works

## Definition of Done

Each phase is complete when:
1. All sub-tasks are checked off
2. No TypeScript errors (tsc --noEmit passes)
3. App builds without errors (vite build)
4. UI matches the design.md specifications
5. Dark mode is the default and looks correct
