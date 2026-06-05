import { expect, test } from '@playwright/test'

const visualRoutes = [
  { name: 'swap', path: '/swap' },
  { name: 'analytics', path: '/analytics' },
]

test.describe('mobile visual baselines', () => {
  for (const route of visualRoutes) {
    test(`captures ${route.name} mobile baseline`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'Desktop Chrome', 'Mobile-only baseline')

      await page.goto(route.path)

      const projectName = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const screenshot = await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(`${route.name}-${projectName}-baseline.png`),
      })

      expect(screenshot.byteLength).toBeGreaterThan(1000)
    })
  }
})
