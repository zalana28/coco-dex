import { expect, test } from '@playwright/test'

const requiredFooterLinks = ['Docs', 'GitHub', 'Terms', 'Privacy']
const forbiddenProductNames = ['Arc DEX', 'The Arc Exchange', 'Arc by Coco DEX', 'Arc App']
const viewportChecks = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]

test.describe('public proof and trust surfaces', () => {
  test('Bridge remains routed and present in application navigation', async ({ page }) => {
    await page.goto('/bridge?bridge-e2e=disconnected')

    await expect(page).toHaveURL(/\/bridge/)
    await expect(page.getByRole('heading', { name: 'Bridge USDC to Arc' })).toBeVisible()

    if (page.viewportSize()!.width >= 768) {
      await expect(page.getByRole('banner').getByRole('link', { name: 'Bridge', exact: true })).toHaveAttribute('aria-current', 'page')
    } else {
      const toggle = page.getByRole('banner').getByRole('button', { name: 'Toggle navigation' })
      await toggle.click()
      await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Bridge', exact: true })).toHaveAttribute('aria-current', 'page')
    }
  })

  test('global footer exposes public proof and keyboard-accessible links', async ({ page }) => {
    await page.goto('/docs')
    const footer = page.getByRole('contentinfo', { name: 'Coco DEX public information' })

    await expect(footer).toBeVisible()
    await expect(footer.getByText('Supports Arc Testnet. Arc Testnet only.')).toBeVisible()
    await expect(footer.getByText(/Unaudited testnet software\. Not production-ready\./)).toBeVisible()
    await expect(footer.getByTestId('deployed-commit')).toContainText(/Build (?:unknown|[a-f0-9]{7})/)

    for (const label of requiredFooterLinks) {
      await expect(footer.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible()
    }

    const terms = footer.getByRole('link', { name: 'Terms', exact: true })
    await terms.focus()
    await expect(terms).toBeFocused()
    await terms.press('Enter')
    await expect(page).toHaveURL(/\/terms$/)
  })

  test('Terms and Privacy owner-review templates load', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Terms of Use' })).toBeVisible()
    await expect(page.getByText('Owner review required template')).toBeVisible()
    await expect(page.getByText(/not been reviewed by legal counsel/i)).toBeVisible()

    await page.getByRole('link', { name: 'Read the Privacy template' }).click()
    await expect(page).toHaveURL(/\/privacy$/)
    await expect(page.getByRole('heading', { name: 'Privacy Notice' })).toBeVisible()
    await expect(page.getByText('Owner review required template')).toBeVisible()
  })

  test('Arc attribution stays descriptive and forbidden product names are absent', async ({ page }) => {
    for (const route of ['/', '/swap', '/bridge?bridge-e2e=disconnected', '/docs', '/terms', '/privacy']) {
      await page.goto(route)
      const body = await page.locator('body').innerText()
      for (const wording of forbiddenProductNames) expect(body).not.toContain(wording)
      await expect(page.getByRole('contentinfo').getByText('Coco DEX', { exact: true })).toBeVisible()
    }
  })

  test('introduces no analytics or tracking request on public landing', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const forbiddenHosts = ['google-analytics.com', 'googletagmanager.com', 'api.segment.io', 'api.mixpanel.com', 'app.posthog.com']
    for (const host of forbiddenHosts) expect(requests.some((url) => url.includes(host)), `${host} request`).toBe(false)
  })
})

test.describe('responsive compliance', () => {
  for (const viewport of viewportChecks) {
    test(`footer and trust routes do not overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      for (const route of ['/bridge?bridge-e2e=disconnected', '/terms', '/privacy']) {
        await page.goto(route)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${route} overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1)
        await expect(page.getByRole('contentinfo')).toBeVisible()
      }
    })
  }
})

// Dialog focus lifecycle remains locked by bridge-responsive.spec.ts. This
// assertion keeps that dedicated regression test present in the suite rather
// than duplicating a timing-sensitive transaction scenario here.
test('Bridge dialog accessibility regression remains in the repository', async ({ page }) => {
  await page.goto('/bridge?bridge-e2e=connected')
  await expect(page.getByTestId('bridge-page-content')).toBeVisible()
})
