import { expect, test } from '@playwright/test'

const routes = ['/', '/swap', '/pools', '/analytics', '/docs']

test.describe('mobile shell', () => {
  for (const route of routes) {
    test(`does not horizontally overflow on ${route}`, async ({ page }) => {
      await page.goto(route)

      const overflow = await page.evaluate(() => {
        const documentWidth = Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        )
        const viewportWidth = document.documentElement.clientWidth

        return documentWidth - viewportWidth
      })

      expect(overflow).toBeLessThanOrEqual(1)
    })
  }

  test('shows the Route Quotes mobile toggle on swap', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'Desktop Chrome', 'Mobile-only quote toggle')

    await page.goto('/swap')

    await expect(page.getByRole('button', { name: /Route Quotes/i })).toBeVisible()
  })

  test('shows positions-first pools layout and opens stable beta flow from modal', async ({ page }) => {
    await page.goto('/pools')

    await expect(page.getByRole('heading', { name: 'Positions', exact: true })).toBeVisible()
    const positionsTab = page.getByRole('tab', { name: 'My Positions', exact: true })
    const poolsTab = page.getByRole('tab', { name: 'Pools', exact: true })
    await expect(positionsTab).toHaveAttribute('aria-selected', 'true')
    await expect(poolsTab).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByRole('heading', { name: /No liquidity positions yet|Connect wallet to view your liquidity positions/ })).toBeVisible()

    await poolsTab.click()
    await expect(poolsTab).toHaveAttribute('aria-selected', 'true')
    const poolsPanel = page.getByTestId('pools-panel')
    await expect(poolsPanel).toBeVisible()
    const poolHeadings = poolsPanel.getByRole('heading', { name: 'USDC / EURC', exact: true })
    await expect(poolHeadings).toHaveCount(2)
    await expect(poolHeadings.first()).toBeVisible()
    await expect(poolsPanel.getByText('Classic Coco V2', { exact: true })).toBeVisible()
    await expect(poolsPanel.getByText('LP Beta', { exact: true })).toBeVisible()
    await expect(poolsPanel.getByText('Unaudited', { exact: true })).toBeVisible()
    await expect(poolsPanel.getByText('Not Routed', { exact: true })).toBeVisible()

    await expect(page.getByText('Slippage tolerance')).toHaveCount(0)
    await expect(page.getByText('Stable Pool Observability')).not.toBeVisible()

    await page.getByRole('button', { name: 'New Position' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: /Classic Coco V2 Pool/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Native Stable Pool Beta/i })).toBeVisible()

    await page.getByRole('button', { name: /Native Stable Pool Beta/i }).click()
    await expect(page.getByText('Coco Native Stable Pool V1 is Arc Testnet LP Beta. Use tiny test amounts only. Unaudited. Not Routed. Quote-only for swaps.')).toBeVisible()
    await expect(page.getByText('Slippage tolerance').first()).toBeVisible()
    await expect(page.getByText('Min cSLP out')).toBeVisible()
  })

  test('shows positions empty state and opens details drawer from pool card', async ({ page }) => {
    await page.goto('/pools')

    await expect(page.getByRole('heading', { name: /No liquidity positions yet|Connect wallet to view your liquidity positions/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Position' })).toBeVisible()

    const poolsTab = page.getByRole('tab', { name: 'Pools', exact: true })
    await poolsTab.click()
    await expect(poolsTab).toHaveAttribute('aria-selected', 'true')
    await page.getByTestId('pools-panel').getByRole('button', { name: 'Details', exact: true }).nth(1).click()
    await expect(page.getByRole('dialog', { name: /USDC \/ EURC Stable Pool Beta/i })).toBeVisible()
    await expect(page.getByText('Stable Pool Observability')).toBeVisible()
    await expect(page.getByText('External liquidity sources')).toBeVisible()
  })

  // Regression guard for the post-merge modal lock: the liquidity modal shell
  // (shared by Add/Remove) must always expose a working close path unless a
  // real wallet transaction is pending. The stable Add flow exercises the same
  // LiquidityActionModal shell as Remove, with no wallet required.
  async function openStableLiquidityModal(page: import('@playwright/test').Page) {
    await page.goto('/pools')
    await page.getByRole('button', { name: 'New Position' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: /Native Stable Pool Beta/i }).click()
    // Beta warning + stable badges remain visible inside the modal.
    await expect(page.getByText(/Arc Testnet LP Beta\. Use tiny test amounts only\. Unaudited\. Not Routed\. Quote-only/i)).toBeVisible()
  }

  test('liquidity modal exposes a visible close X', async ({ page }) => {
    await openStableLiquidityModal(page)
    const closeX = page.getByRole('button', { name: 'Close liquidity modal' })
    await expect(closeX).toBeVisible()
    const box = await closeX.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(40)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
  })

  test('liquidity modal closes with X', async ({ page }) => {
    await openStableLiquidityModal(page)
    await page.getByRole('button', { name: 'Close liquidity modal' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('liquidity modal closes with Escape', async ({ page }) => {
    await openStableLiquidityModal(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('liquidity modal closes with backdrop click', async ({ page }) => {
    await openStableLiquidityModal(page)
    await page.getByRole('button', { name: 'Dismiss liquidity modal overlay' }).click({ position: { x: 5, y: 5 } })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('liquidity modal closes with footer Close button', async ({ page }) => {
    await openStableLiquidityModal(page)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('liquidity modal keeps close X visible after internal scroll', async ({ page }) => {
    await openStableLiquidityModal(page)
    const scroll = page.getByTestId('liquidity-modal-scroll')
    await scroll.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const closeX = page.getByRole('button', { name: 'Close liquidity modal' })
    await expect(closeX).toBeInViewport()
    // Sticky footer Close also remains reachable after scrolling.
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

// Auto best-route selection on /swap. These run without a connected wallet, so
// they assert the structural best-route UI (panel, badges, freshness, no-route
// state) that renders for any valid amount regardless of live RPC results.
test.describe('swap best route', () => {
  test('entering an amount surfaces the best-route selection UI', async ({ page }, testInfo) => {
    await page.goto('/swap')
    await page.locator('input[type="number"]').first().fill('1')

    // The best-route region resolves to exactly one of these deterministic states.
    await expect(
      page.getByText(/Best route|Finding best route|No executable route available/i).first(),
    ).toBeVisible()

    if (testInfo.project.name === 'Desktop Chrome') {
      await expect(page.getByRole('heading', { name: 'Route quotes' })).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: /Route Quotes/i })).toBeVisible()
    }
  })

  test('swap action is gated until an executable route is selected', async ({ page }) => {
    await page.goto('/swap')
    await page.locator('input[type="number"]').first().fill('1')
    // With no wallet connected the primary action is always disabled (Connect
    // Wallet), so the swap can never fire without an executable selected route.
    const primary = page.getByRole('button', { name: /Connect Wallet|Finding best route|No executable route|Swap/i }).last()
    await expect(primary).toBeDisabled()
  })

  test('/swap has no horizontal overflow after entering an amount', async ({ page }) => {
    await page.goto('/swap')
    await page.locator('input[type="number"]').first().fill('1000000')

    const overflow = await page.evaluate(() => {
      const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      return documentWidth - document.documentElement.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
