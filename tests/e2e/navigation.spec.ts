/* eslint-disable no-empty-pattern -- Playwright fixture object requires a leading empty pattern */
import { expect, test } from '@playwright/test'

const appRoutes = ['/swap', '/bridge', '/pools', '/analytics', '/docs']
const appNavLabels = ['Swap', 'Bridge', 'Pools', 'Analytics', 'Docs']
const forbiddenLandingLabels = ['Swap', 'Bridge', 'Pools', 'Analytics', 'Docs', 'Explore Pools', 'View Analytics']
const landingAnchors = ['#pools-preview', '#analytics-preview', '#docs-preview']

const isMobile = (name: string) => name !== 'Desktop Chrome'

function appHeading(page: import('@playwright/test').Page) {
  return page.getByRole('heading', { level: 1 })
}

test.describe('landing information architecture', () => {
  test('landing header contains only the logo and Launch App', async ({ page }) => {
    await page.goto('/')

    const banner = page.getByRole('banner')
    await expect(banner).toBeVisible()

    // Launch App is present and is the only navigation entry in the header.
    await expect(banner.getByRole('link', { name: 'Launch App', exact: true })).toBeVisible()
    await expect(banner.getByRole('link', { name: 'Coco DEX home', exact: true })).toBeVisible()

    // No application navigation region or links exist in the header.
    await expect(banner.getByRole('navigation')).toHaveCount(0)
    for (const label of forbiddenLandingLabels) {
      await expect(banner.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
  })

  test('landing header has no mobile menu exposing app routes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 })
    await page.goto('/')

    // There is no toggle/menu button in the landing header.
    await expect(page.getByRole('banner').getByRole('button', { name: 'Toggle navigation' })).toHaveCount(0)
  })

  test('Launch App navigates to /swap', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('banner').getByRole('link', { name: 'Launch App', exact: true }).click()
    await expect(page).toHaveURL(/\/swap$/)
  })

  test('secondary landing actions stay on / and scroll to anchors', async ({ page }) => {
    await page.goto('/')

    for (const anchor of landingAnchors) {
      const link = page.locator(`a[href="${anchor}"]`).first()
      await expect(link).toBeVisible()

      await link.click()
      // Still on the landing route (only a hash is added); no app navigation revealed.
      expect(await page.evaluate(() => location.pathname)).toBe('/')
      await expect(page.getByRole('banner').getByRole('navigation')).toHaveCount(0)
    }
  })

  test('clicking a secondary action does not reveal application navigation', async ({ page }) => {
    await page.goto('/')

    await page.locator('a[href="#analytics-preview"]').first().click()
    expect(await page.evaluate(() => location.pathname)).toBe('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Swap', exact: true })).toHaveCount(0)
  })

  test('no app navigation appears before Launch App is clicked', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('banner').getByRole('link', { name: 'Swap', exact: true })).toHaveCount(0)
    await expect(page.getByRole('banner').getByRole('link', { name: 'Bridge', exact: true })).toHaveCount(0)
    await expect(page.getByRole('banner').getByRole('link', { name: 'Pools', exact: true })).toHaveCount(0)
  })
})

test.describe('application navigation', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(isMobile(testInfo.project.name), 'Desktop header only')
  })

  for (const route of appRoutes) {
    test(`${route} shows app navigation and no Launch App button`, async ({ page }) => {
      await page.goto(route)

      const primary = page.getByRole('banner').getByRole('navigation', { name: 'Primary' })
      await expect(primary).toBeVisible()

      for (const label of appNavLabels) {
        await expect(primary.getByRole('link', { name: label, exact: true })).toBeVisible()
      }
      await expect(page.getByRole('banner').getByRole('link', { name: 'Launch App', exact: true })).toHaveCount(0)
    })

    test(`${route} shows the correct active route`, async ({ page }) => {
      await page.goto(route)

      const expected =
        route === '/pools' ? 'Pools' : route.replace('/', '').replace(/^\w/, (c) => c.toUpperCase())
      const active = page.getByRole('banner').getByRole('link', { name: expected, exact: true })
      await expect(active).toHaveAttribute('aria-current', 'page')
    })
  }

  test('logo returns to / from an app route', async ({ page }) => {
    await page.goto('/swap')
    await page.getByRole('link', { name: 'Coco DEX home', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('direct app route works without visiting Home', async ({ page }) => {
    await page.goto('/bridge')
    await expect(page).toHaveURL(/\/bridge$/)
    await expect(appHeading(page)).toBeVisible()
  })

  test('refreshing an app route preserves the route', async ({ page }) => {
    await page.goto('/analytics')
    await page.reload()
    await expect(page).toHaveURL(/\/analytics$/)
    await expect(appHeading(page)).toBeVisible()
  })
})

test.describe('application navigation (mobile)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), 'Mobile header only')
  })

  test('after Launch App, app navigation becomes available on mobile', async ({ page }) => {
    await page.goto('/swap')

    const toggle = page.getByRole('banner').getByRole('button', { name: 'Toggle navigation' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const panel = page.getByRole('navigation', { name: 'Primary' })
    await expect(panel.getByRole('link', { name: 'Bridge', exact: true })).toBeVisible()
    await expect(panel.getByRole('link', { name: 'Launch App', exact: true })).toHaveCount(0)
  })

  test('active route is indicated inside the mobile panel', async ({ page }) => {
    await page.goto('/bridge')
    const toggle = page.getByRole('banner').getByRole('button', { name: 'Toggle navigation' })
    await toggle.click()

    const active = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Bridge', exact: true })
    await expect(active).toHaveAttribute('aria-current', 'page')
  })

  test('mobile app panel exposes no Launch App button', async ({ page }) => {
    await page.goto('/swap')
    const toggle = page.getByRole('banner').getByRole('button', { name: 'Toggle navigation' })
    await toggle.click()

    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Launch App', exact: true })).toHaveCount(0)
  })

  test('app navigation panel does not overflow the viewport on mobile', async ({ page }) => {
    await page.goto('/bridge')
    await page.setViewportSize({ width: 360, height: 720 })
    const toggle = page.getByRole('banner').getByRole('button', { name: 'Toggle navigation' })
    await toggle.click()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test.describe('landing mobile behavior', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), 'Mobile landing only')
  })

  test('landing shows logo and Launch App only, no app links', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 })
    await page.goto('/')

    const banner = page.getByRole('banner')
    await expect(banner.getByRole('link', { name: 'Coco DEX home', exact: true })).toBeVisible()
    await expect(banner.getByRole('link', { name: 'Launch App', exact: true })).toBeVisible()

    // No toggle, no nav region, no forbidden links.
    await expect(banner.getByRole('button', { name: 'Toggle navigation' })).toHaveCount(0)
    await expect(banner.getByRole('navigation')).toHaveCount(0)
    for (const label of forbiddenLandingLabels) {
      await expect(banner.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
  })

  test('landing has no horizontal overflow at 320px and Pixel 5 widths', async ({ page }) => {
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 720 })
      await page.goto('/')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1)
    }
  })
})
