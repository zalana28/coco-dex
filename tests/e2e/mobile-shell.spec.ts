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

  test('shows stable pool beta safety controls on pools', async ({ page }) => {
    await page.goto('/pools')

    await expect(page.getByRole('heading', { name: 'Coco Native Stable Pool' })).toBeVisible()
    await expect(page.getByText('LP Beta').first()).toBeVisible()
    await expect(page.getByText('Unaudited').first()).toBeVisible()
    await expect(page.getByText('Not routed').first()).toBeVisible()
    await expect(page.getByText('Arc Testnet LP Beta. Use tiny test amounts only. Unaudited. Not routed. Not indexed in analytics yet.').first()).toBeVisible()
    await expect(page.getByText('Slippage tolerance').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '25%' })).toBeVisible()
    await expect(page.getByRole('button', { name: '50%' })).toBeVisible()
    await expect(page.getByRole('button', { name: '75%' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Max' })).toBeVisible()
  })
})
