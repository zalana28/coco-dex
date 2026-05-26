# Coco DEX - Requirements

## Overview

Coco DEX is a Uniswap V2-style decentralized exchange MVP built on Arc Testnet. It provides a premium, calm, stablecoin-native trading experience with a tropical-fintech aesthetic that feels trustworthy and professional.

## Functional Requirements

### FR-1: App Shell & Navigation

- **FR-1.1**: Single-page application with client-side routing (React + Vite + TypeScript)
- **FR-1.2**: Global navigation with links to: Swap, Pools, Analytics
- **FR-1.3**: Persistent wallet connect button in the header
- **FR-1.4**: Responsive design supporting desktop (1440px+), tablet (768px), and mobile (375px)
- **FR-1.5**: Landing page with hero section, key metrics, and call-to-action

### FR-2: Wallet Integration

- **FR-2.1**: Connect wallet via wagmi/viem with support for injected wallets (MetaMask, etc.)
- **FR-2.2**: Display connected wallet address (truncated) and balance
- **FR-2.3**: Disconnect wallet functionality
- **FR-2.4**: Auto-prompt to switch to Arc Testnet (Chain ID: 5042002) if on wrong network
- **FR-2.5**: Display connection states: disconnected, connecting, connected, wrong network

### FR-3: Swap Interface

- **FR-3.1**: Token input fields for "From" and "To" with amount inputs
- **FR-3.2**: Token selector dropdown showing USDC and EURC with balances
- **FR-3.3**: Swap direction toggle (reverse From/To tokens)
- **FR-3.4**: Real-time price quote display (mocked initially)
- **FR-3.5**: Price impact indicator with color-coded severity (green < 1%, yellow < 3%, red > 3%)
- **FR-3.6**: Slippage tolerance settings (0.1%, 0.5%, 1.0%, custom)
- **FR-3.7**: Route preview showing swap path
- **FR-3.8**: Minimum received / Maximum sent calculation
- **FR-3.9**: Swap button states: Connect Wallet, Enter Amount, Insufficient Balance, Approve Token, Swap
- **FR-3.10**: Transaction confirmation modal with details
- **FR-3.11**: Loading/pending transaction states

### FR-4: Pools Interface

- **FR-4.1**: List of available liquidity pools with TVL, volume, APR (mocked)
- **FR-4.2**: Add Liquidity screen with dual token inputs
- **FR-4.3**: Remove Liquidity screen with percentage slider (25%, 50%, 75%, 100%)
- **FR-4.4**: Pool share calculation display
- **FR-4.5**: User's liquidity positions list
- **FR-4.6**: Pool detail view with historical data (mocked)

### FR-5: Analytics Dashboard

- **FR-5.1**: Protocol-level metrics: TVL, 24h Volume, Total Fees (mocked)
- **FR-5.2**: Top pools table with sortable columns
- **FR-5.3**: Top tokens table with price, volume, TVL
- **FR-5.4**: Simple chart placeholders for TVL/Volume over time

### FR-6: Arc Testnet Integration

- **FR-6.1**: Chain configuration for Arc Testnet (Chain ID 5042002, RPC, Explorer)
- **FR-6.2**: USDC token config (address: 0x3600000000000000000000000000000000000000, 6 decimals)
- **FR-6.3**: EURC token config (address: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a, 6 decimals)
- **FR-6.4**: Native gas token treated as USDC via ERC-20 interface (6 decimals)
- **FR-6.5**: Contract integration placeholders (factory, router, pair) without invented addresses

## Non-Functional Requirements

### NFR-1: Performance

- Page load < 2s on 3G connection
- Swap quote updates < 500ms (when connected to live contracts)
- Smooth 60fps animations and transitions

### NFR-2: Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation for all interactive elements
- Screen reader friendly labels and ARIA attributes

### NFR-3: Security

- No private keys stored client-side
- Input sanitization for all numeric fields
- Slippage protection on all swaps
- Clear warnings for high price impact trades

### NFR-4: Developer Experience

- TypeScript strict mode
- ESLint + Prettier configured
- Component-based architecture with clear separation of concerns
- Well-typed contract ABIs and hook interfaces

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| Web3 | wagmi v2 + viem |
| Routing | React Router v6 |
| State | React hooks + wagmi state |
| Charts | Lightweight charting (recharts or similar) |
| Testing | Vitest + React Testing Library |

## Token Configuration

| Token | Symbol | Address | Decimals |
|-------|--------|---------|----------|
| USD Coin | USDC | 0x3600000000000000000000000000000000000000 | 6 |
| Euro Coin | EURC | 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a | 6 |

## Chain Configuration

| Property | Value |
|----------|-------|
| Chain Name | Arc Testnet |
| Chain ID | 5042002 |
| RPC URL | https://rpc.testnet.arc.network |
| Block Explorer | https://testnet.arcscan.app |
| Native Currency | USDC (6 decimals) |
