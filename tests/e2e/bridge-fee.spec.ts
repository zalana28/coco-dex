import { expect, test } from '@playwright/test'

const address = `0x${'f'.repeat(40)}`

async function openEstimatedBridge(page: import('@playwright/test').Page, scenario = 'ethereum') {
  await page.goto(`/bridge?bridge-e2e=${scenario}`)
  await expect(page.getByRole('heading', { name: 'Bridge USDC to Arc' })).toBeVisible()
  await page.getByLabel('Recipient on Arc').fill(address)
  await page.getByLabel('USDC amount').fill('10')
  await page.getByRole('button', { name: 'Estimate bridge' }).click()
  await expect(page.getByTestId('estimate-panel')).toContainText('Destination amount')
}

test.describe('CCTP bridge fee and transfer-mode UX', () => {
  test('Standard transfer shows a zero CCTP protocol fee, never "Unavailable"', async ({ page }) => {
    await openEstimatedBridge(page)
    const panel = page.getByTestId('estimate-panel')
    await expect(panel.getByText('CCTP protocol fee: 0 USDC — Standard transfer')).toBeVisible()
    await expect(panel.getByText('Unavailable', { exact: true })).toHaveCount(0)
    await expect(panel.getByText('Destination gas')).toBeVisible()
    await expect(panel.getByText('Paid by Forwarding Service')).toBeVisible()
  })

  test('Standard estimate succeeds even though no Fast provider fee is offered', async ({ page }) => {
    await openEstimatedBridge(page)
    await expect(page.getByRole('button', { name: 'Review transfer' })).toBeEnabled()
    // No Fast toggle appears when the FAST estimate could not be produced.
    await expect(page.getByRole('button', { name: /Fast/ })).toHaveCount(0)
  })

  test('shows the explicit recipient on the confirmation dialog', async ({ page }) => {
    await openEstimatedBridge(page)
    await page.getByRole('button', { name: 'Review transfer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirm bridge' })
    await expect(dialog.getByText(address)).toBeVisible()
    await expect(dialog.getByText('Mode')).toBeVisible()
    await expect(dialog.getByText('Standard')).toBeVisible()
  })

  test('keeps the estimate panel contained at 320px without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await openEstimatedBridge(page)
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }))
    expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  })

  test('Standard transfer is the default and Fast is never auto-selected', async ({ page }) => {
    await openEstimatedBridge(page)
    await expect(page.getByRole('button', { name: 'Standard' })).toHaveAttribute('aria-pressed', 'true')
  })
})
