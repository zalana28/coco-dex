# Coco DEX - Design Document

## Visual Identity

### Design Philosophy

Coco DEX embodies **tropical fintech** — a premium, calm, and trustworthy experience that signals stability and professionalism. This is NOT a meme DEX. The aesthetic draws from high-end financial applications with subtle tropical warmth.

**Key Principles:**
- **Premium & Calm**: Clean whitespace, subtle gradients, muted tones
- **Stablecoin-Native**: Design that communicates stability and trust
- **Tropical Warmth**: Soft greens, warm sand tones, gentle organic curves — never loud or garish
- **Professional**: Feels like a fintech app, not a crypto casino

### Color Palette

```
Primary:
  --coco-green-50:  #f0fdf4   (lightest background tint)
  --coco-green-100: #dcfce7   (subtle highlight)
  --coco-green-200: #bbf7d0   (borders, accents)
  --coco-green-500: #22c55e   (primary action, positive)
  --coco-green-600: #16a34a   (primary hover)
  --coco-green-900: #14532d   (dark text on light)

Neutral (Sand):
  --coco-sand-50:   #fefdfb   (page background)
  --coco-sand-100:  #fdf9f3   (card background)
  --coco-sand-200:  #f5efe6   (borders, dividers)
  --coco-sand-300:  #e8dfd3   (disabled states)
  --coco-sand-700:  #6b5e50   (secondary text)
  --coco-sand-900:  #3d3530   (primary text)

Accent:
  --coco-teal-400:  #2dd4bf   (info, links)
  --coco-teal-600:  #0d9488   (info hover)

Semantic:
  --coco-red-500:   #ef4444   (error, high impact)
  --coco-amber-500: #f59e0b   (warning, medium impact)
  --coco-green-500: #22c55e   (success, low impact)

Dark Mode (primary):
  --coco-dark-bg:       #1a1814   (page background)
  --coco-dark-surface:  #252119   (card surface)
  --coco-dark-border:   #3d3530   (borders)
  --coco-dark-text:     #fdf9f3   (primary text)
  --coco-dark-muted:    #a89b8c   (secondary text)
```

### Typography

```
Font Family: Inter (headings + body), JetBrains Mono (numbers, addresses)
Font Sizes:
  - Display: 48px / 56px line-height / -0.02em tracking
  - H1: 32px / 40px / -0.01em
  - H2: 24px / 32px / -0.01em
  - H3: 20px / 28px
  - Body: 16px / 24px
  - Caption: 14px / 20px
  - Micro: 12px / 16px
Font Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
```

### Spacing & Layout

```
Border Radius:
  - Cards: 16px
  - Buttons: 12px
  - Inputs: 12px
  - Pills/Tags: 9999px (full round)

Spacing Scale: 4px base unit
  - xs: 4px
  - sm: 8px
  - md: 16px
  - lg: 24px
  - xl: 32px
  - 2xl: 48px
  - 3xl: 64px

Max Content Width: 1200px
Swap Card Width: 480px (max)
```

### Shadows & Depth

```
Elevation 1 (cards): 0 1px 3px rgba(61, 53, 48, 0.04), 0 1px 2px rgba(61, 53, 48, 0.06)
Elevation 2 (dropdowns): 0 4px 6px rgba(61, 53, 48, 0.04), 0 2px 4px rgba(61, 53, 48, 0.06)
Elevation 3 (modals): 0 20px 25px rgba(61, 53, 48, 0.08), 0 8px 10px rgba(61, 53, 48, 0.04)
```

## Component Design

### Navigation Bar

```
┌─────────────────────────────────────────────────────────────────┐
│  🥥 Coco DEX          Swap    Pools    Analytics    [Connect]   │
└─────────────────────────────────────────────────────────────────┘
```

- Fixed top, frosted glass effect (backdrop-blur)
- Logo: Coconut icon + "Coco DEX" wordmark
- Active link: green underline accent
- Connect button: primary green, rounded

### Swap Card

```
┌──────────────────────────────────────────┐
│  Swap                         ⚙️ Settings │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │  From                            │    │
│  │  [USDC ▾]          [0.00      ]  │    │
│  │  Balance: 1,000.00               │    │
│  └──────────────────────────────────┘    │
│                                          │
│              [ ⇅ ]                       │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │  To                              │    │
│  │  [EURC ▾]          [0.00      ]  │    │
│  │  Balance: 500.00                  │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │  1 USDC = 0.92 EURC              │    │
│  │  Price Impact: <0.01%     🟢     │    │
│  │  Min. Received: 91.82 EURC       │    │
│  │  Route: USDC → EURC              │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │         [ Swap ]                  │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

- Card: sand-100 background, elevation 1, 16px radius
- Token inputs: inset style with sand-200 background
- Swap button: full-width, green gradient, 12px radius
- Direction toggle: circular button, subtle hover animation

### Pool Card

```
┌──────────────────────────────────────────┐
│  USDC / EURC                    APR: 12% │
│                                          │
│  TVL: $2.4M        24h Vol: $890K        │
│  Your Share: 0.05%  Your LP: $1,200      │
│                                          │
│  [Add Liquidity]    [Remove]             │
└──────────────────────────────────────────┘
```

### Settings Panel (Slippage)

```
┌──────────────────────────────────────────┐
│  Slippage Tolerance                      │
│                                          │
│  [0.1%] [0.5%] [1.0%] [Custom: ___% ]   │
│                                          │
│  Transaction Deadline                    │
│  [ 30 ] minutes                          │
└──────────────────────────────────────────┘
```

## Page Layouts

### Landing Page

- Hero: Large headline "Trade stablecoins with confidence" + subtext
- Stats bar: TVL, Volume, Trades (animated counters)
- Feature cards: Low fees, Deep liquidity, Instant settlement
- CTA button: "Start Trading" → navigates to /swap

### Swap Page

- Centered swap card (max 480px)
- Recent transactions below (optional)
- Subtle animated background gradient

### Pools Page

- Tab navigation: All Pools | My Positions
- Pool list with search/filter
- Add liquidity modal/page
- Remove liquidity with percentage selector

### Analytics Page

- Metric cards row: TVL, Volume, Fees, Transactions
- TVL chart (area chart, green fill)
- Top Pools table
- Top Tokens table

## Interaction States

### Button States

| State | Appearance |
|-------|-----------|
| Default | Green background, white text |
| Hover | Darker green, subtle scale(1.01) |
| Active | Even darker, scale(0.99) |
| Disabled | Sand-300 background, muted text |
| Loading | Spinner icon + "Swapping..." text |

### Input States

| State | Appearance |
|-------|-----------|
| Default | Sand-200 background, sand-300 border |
| Focus | Green-200 border, subtle green glow |
| Error | Red-500 border, red tint background |
| Disabled | Sand-100 background, reduced opacity |

### Toast Notifications

- Success: Green left border, checkmark icon
- Error: Red left border, X icon
- Pending: Amber left border, spinner icon
- Positioned top-right, auto-dismiss after 5s

## Animations

- Page transitions: fade + subtle slide (200ms ease)
- Card hover: translateY(-2px) + shadow increase
- Number changes: countUp animation
- Token swap direction: rotate(180deg) on the arrow
- Modal: fade in + scale from 0.95 (150ms)

## Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| ≥1024px | Full desktop layout, side margins |
| 768-1023px | Tablet, slightly condensed |
| <768px | Mobile, stacked layout, bottom nav |

## Dark Mode

Default to dark mode. The dark palette uses warm dark tones (not pure black) to maintain the tropical warmth:
- Background: warm charcoal (#1a1814)
- Cards: slightly lighter (#252119)
- Text: warm white (#fdf9f3)
- Accents remain the same green/teal
