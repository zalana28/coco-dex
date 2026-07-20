import { expect, test, type Page } from '@playwright/test'

const address = `0x${'f'.repeat(40)}`

async function openEstimatedBridge(page: Page, scenario = 'ethereum') {
  await page.goto(`/bridge?bridge-e2e=${scenario}`)
  await expect(page.getByRole('heading', { name: 'Bridge USDC to Arc' })).toBeVisible()
  await page.getByLabel('Recipient on Arc').fill(address)
  await page.getByLabel('USDC amount').fill('10')
  await page.getByRole('button', { name: 'Estimate bridge' }).click()
  await expect(page.getByTestId('estimate-panel')).toContainText('Destination amount')
}

test.describe('CCTP bridge fee and transfer-mode UX', () => {
  test('Standard transfer exposes a zero CCTP protocol fee and Forwarding Service gas', async ({ page }) => {
    await openEstimatedBridge(page)
    const panel = page.getByTestId('estimate-panel')

    await expect(panel.getByTestId('cctp-protocol-fee-label')).toContainText('CCTP protocol fee')
    // Standard/SLOW: exact amount 0 USDC.
    await expect(panel.getByTestId('cctp-protocol-fee-amount')).toHaveText('0 USDC — Standard transfer')
    // Never rendered as the failing "Unavailable" sentinel.
    await expect(panel.getByText('Unavailable', { exact: true })).toHaveCount(0)
    // Destination gas is paid by the Forwarding Service.
    await expect(panel.getByTestId('destination-gas-label')).toContainText('Destination gas')
    await expect(panel.getByTestId('destination-gas-status')).toContainText('Paid by Forwarding Service')
  })

  test('Fast is available only after a valid Fast estimate, and Standard stays the active mode', async ({ page }) => {
    await openEstimatedBridge(page)
    // A valid Fast estimate exists in this scenario, so the control is present...
    const fast = page.getByTestId('fast-mode-control')
    await expect(fast).toBeVisible()
    // ...but it must NOT be pre-selected; Standard remains the active transfer mode.
    await expect(page.getByTestId('transfer-mode-standard')).toHaveAttribute('aria-pressed', 'true')
    await expect(fast).toHaveAttribute('aria-pressed', 'false')
    // Confirming now still submits a Standard transfer (verified in the dialog below).
  })

  test('confirmation dialog exposes the exact full recipient address', async ({ page }) => {
    await openEstimatedBridge(page)
    await page.getByRole('button', { name: 'Review transfer' }).click()
    const dialog = page.getByTestId('bridge-confirmation-dialog')
    await expect(dialog).toBeVisible()

    // The full recipient is exposed via a stable test id + accessible title (no truncation).
    const recipient = dialog.getByTestId('recipient-address')
    await expect(recipient).toHaveAttribute('title', address)
    await expect(recipient).toHaveText(address)
    await expect(dialog.getByTestId('transfer-mode')).toHaveText('Standard')
    await expect(dialog.getByTestId('transfer-mode-label')).toContainText('Mode')
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
})
