import { expect, test } from '@playwright/test'

const routes = ['/', '/swap', '/analytics', '/docs']

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
})
