/* eslint-disable no-empty-pattern -- Playwright fixture object requires a leading empty pattern */
import { expect, test } from '@playwright/test'

const appRoutes = ['/swap', '/bridge', '/pools', '/analytics']
const appNavLabels = ['Swap', 'Bridge', 'Pools', 'Analytics']
const landingNavLabels = ['Docs', 'Explore Pools', 'View Analytics']

const isMobile = (name: string) => name !== 'Desktop Chrome'

function pageHeading(page: import('@playwright/test').Page) {
  // Each app route renders a single <h1>; the landing page has no page-level h1 in this slot.
  return page.getByRole('heading', { level: 1 })
}

test.describe('landing navigation (desktop)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(isMobile(testInfo.project.name), 'Desktop header only')
  })

  test('landing header primary nav excludes app features', async ({ page }) => {
    await page.goto('/')

    const landing = page.getByRole('banner').getByRole('navigation', { name: 'Landing' })
    await expect(landing).toBeVisible()

    for (const label of appNavLabels) {
      await expect(landing.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
    // The application navigation must not exist on the landing route.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  })

  test('header Launch App navigates to /swap', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('banner').getByRole('link', { name: 'Launch App', exact: true }).click()
    await expect(page).toHaveURL(/\/swap$/)
  })

  test('secondary landing links navigate to their app pages', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('banner').getByRole('link', { name: 'Explore Pools', exact: true }).click()
    await expect(page).toHaveURL(/\/pools$/)
  })

  test('Docs remains reachable from the landing header', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('banner').getByRole('link', { name: 'Docs', exact: true }).click()
    await expect(page).toHaveURL(/\/docs$/)
  })
})

test.describe('landing navigation (shared)', () => {
  test('hero Launch App navigates to /swap', async ({ page }) => {
    await page.goto('/')

    // The hero button is page content, not the header banner.
    await page.getByRole('link', { name: /Launch App/i }).first().click()
    await expect(page).toHaveURL(/\/swap$/)
  })

  test('logo remains an accessible home link', async ({ page }) => {
    await page.goto('/')

    const logo = page.getByRole('link', { name: 'Coco DEX home', exact: true })
    await expect(logo).toBeVisible()
    await logo.click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('landing navigation (mobile)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), 'Mobile header only')
  })

  test('landing header does not overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('Launch App (hero) remains visible and usable on landing mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')

    const launch = page.getByRole('link', { name: /Launch App/i }).first()
    await expect(launch).toBeVisible()
    await launch.click()
    await expect(page).toHaveURL(/\/swap$/)
  })

  test('mobile landing panel opens, closes, and excludes app features', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 })
    await page.goto('/')

    const toggle = page.getByRole('banner').getByRole('button', { name: 'Toggle navigation' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const panel = page.getByRole('navigation', { name: 'Primary' })
    for (const label of landingNavLabels) {
      await expect(panel.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    for (const label of appNavLabels) {
      await expect(panel.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
    await expect(page.getByRole('banner').getByRole('link', { name: 'Launch App', exact: true })).toBeVisible()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('application navigation (desktop)', () => {
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

  test('Docs is reachable from the app header', async ({ page }) => {
    await page.goto('/swap')
    await page.getByRole('banner').getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Docs', exact: true }).click()
    await expect(page).toHaveURL(/\/docs$/)
  })
})

test.describe('application navigation (shared)', () => {
  test('direct app route works without visiting Home', async ({ page }) => {
    await page.goto('/bridge')
    await expect(page).toHaveURL(/\/bridge$/)
    await expect(pageHeading(page)).toBeVisible()
    await expect(page.getByRole('banner').getByRole('link', { name: 'Coco DEX home', exact: true })).toBeVisible()
  })

  test('refreshing an app route preserves the route', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page).toHaveURL(/\/analytics$/)
    await page.reload()
    await expect(page).toHaveURL(/\/analytics$/)
    await expect(pageHeading(page)).toBeVisible()
  })

  test('logo returns to / from an app route', async ({ page }) => {
    await page.goto('/swap')
    await page.getByRole('link', { name: 'Coco DEX home', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('application navigation (mobile)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), 'Mobile header only')
  })

  test('app navigation is accessible after entering /swap on mobile', async ({ page }) => {
    await page.goto('/swap')

    const toggle = page.getByRole('banner').getByRole('button', { name: 'Toggle navigation' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const panel = page.getByRole('navigation', { name: 'Primary' })
    await expect(panel.getByRole('link', { name: 'Bridge', exact: true })).toBeVisible()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
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
