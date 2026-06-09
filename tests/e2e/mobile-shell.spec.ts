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

  test('shows simplified pools layout and opens stable beta flow from modal', async ({ page }) => {
    await page.goto('/pools')

    await expect(page.getByRole('heading', { name: 'Pools' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'All Pools' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'My Positions' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'USDC / EURC' }).first()).toBeVisible()
    await expect(page.getByText('Classic Coco V2', { exact: true })).toBeVisible()
    await page.getByText('LP Beta').first().scrollIntoViewIfNeeded()
    await expect(page.getByText('LP Beta').first()).toBeVisible()
    await expect(page.getByText('Unaudited').first()).toBeVisible()
    await expect(page.getByText('Not Routed').first()).toBeVisible()

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

  test('shows positions empty state and keeps advanced details collapsed by default', async ({ page }) => {
    await page.goto('/pools')

    await page.getByRole('button', { name: 'My Positions' }).click()
    await expect(page.getByRole('heading', { name: /No LP positions yet|Connect your wallet/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Liquidity' })).toBeVisible()

    await page.getByRole('button', { name: 'All Pools' }).click()
    await page.getByText('View Details').nth(1).click()
    await expect(page.getByText('Stable Pool Observability')).toBeVisible()
    await expect(page.getByText('External liquidity sources')).toBeVisible()
  })
})
