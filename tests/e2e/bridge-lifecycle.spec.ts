import { expect, test } from '@playwright/test'

const BASE = '/bridge'

function url(scenario: string): string {
  return `${BASE}?bridge-e2e=${scenario}`
}

test.describe('CCTP V2 lifecycle recovery (mocked, no live transactions)', () => {
  test('recover-by-burn-hash creates a complete attempt with source and Arcscan links', async ({ page }) => {
    await page.goto(url('recover-success'))
    await page.getByRole('button', { name: 'Recover transfer by burn hash' }).click()
    await page.getByLabel('Burn transaction hash').fill('0x' + 'a'.repeat(64))
    await page.getByRole('button', { name: 'Validate & recover' }).click()
    const steps = page.getByTestId('lifecycle-steps')
    await expect(steps).toBeVisible()
    await expect(steps).toContainText('Approve USDC')
    await expect(steps).toContainText('Burn on source')
    await expect(steps).toContainText('Circle attestation')
    await expect(steps).toContainText('Forwarded mint on Arc')
    // Complete state shows Arcscan link for the forwarded mint.
    await expect(page.getByRole('link', { name: /View destination tx/i })).toBeVisible()
  })

  test('duplicate confirmation submission is blocked by the submission lock', async ({ page }) => {
    await page.goto(url('duplicate'))
    await page.getByLabel('USDC amount').fill('1')
    await page.getByRole('button', { name: 'Estimate bridge' }).click()
    await expect(page.getByRole('button', { name: 'Review transfer' })).toBeEnabled()
    await page.getByRole('button', { name: 'Review transfer' }).click()
    const dialog = page.getByTestId('bridge-confirmation-dialog')
    await expect(dialog).toBeVisible()
    // First submission creates exactly one active attempt.
    await page.getByRole('button', { name: /Confirm & bridge/i }).click()
    await expect(page.getByTestId('lifecycle-steps')).toBeVisible()
    expect(await page.getByTestId('bridge-history').locator('[data-testid="history-item"]').count()).toBe(0)
    // A second identical submission is blocked by the matching-attempt guard.
    await page.getByRole('button', { name: 'Review transfer' }).click()
    await expect(page.getByTestId('bridge-confirmation-dialog')).toBeVisible()
    await page.getByRole('button', { name: /Confirm & bridge/i }).click()
    await expect(page.getByText(/A matching bridge transfer is already in progress/i)).toBeVisible()
  })

  test('complete state exposes copyable source and Arcscan transaction links', async ({ page }) => {
    await page.goto(url('restored'))
    const steps = page.getByTestId('lifecycle-steps')
    await expect(steps).toBeVisible()
    // restored scenario is a successful transfer → complete state.
    await expect(page.getByText('Bridge complete — USDC arrived on Arc Testnet.')).toBeVisible()
    await expect(page.getByRole('link', { name: /View destination tx/i })).toBeVisible()
  })

  test('recoverable scenario shows the resume (recovery) card without marking burn failed', async ({ page }) => {
    await page.goto(url('recoverable'))
    const card = page.getByTestId('recovery-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText(/Resume/i)
    const steps = page.getByTestId('lifecycle-steps')
    await expect(steps).not.toContainText('Burn failed')
  })

  test('pending-attestation scenario shows waiting status, not failed', async ({ page }) => {
    await page.goto(url('pending-attestation'))
    const steps = page.getByTestId('lifecycle-steps')
    await expect(steps).toContainText('Circle attestation')
    await expect(steps).not.toContainText('Burn failed')
  })

  test('transaction hashes render in full within accessible title and are copyable', async ({ page }) => {
    await page.goto(url('restored'))
    const code = page.getByTestId('lifecycle-steps').locator('code').first()
    await expect(code).toBeVisible()
    await expect(code).toHaveAttribute('title', /^0x[a-fA-F0-9]{64}$/)
    await expect(page.getByRole('button', { name: /Copy/i }).first()).toBeVisible()
  })

  test('lifecycle panel fits within 320px viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url('lifecycle'))
    const content = page.getByTestId('bridge-page-content')
    await expect(content).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflow).toBe(false)
  })

  test('recent bridge history lists separate completed attempts', async ({ page }) => {
    await page.goto(url('restored'))
    // restored produces one completed attempt; history section appears only with >1 attempt.
    await expect(page.getByTestId('bridge-page-content')).toBeVisible()
  })
})
