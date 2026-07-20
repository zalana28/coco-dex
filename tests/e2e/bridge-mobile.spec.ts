import { expect, test } from '@playwright/test'

async function enterAmountAndEstimate(page: import('@playwright/test').Page) {
  await page.getByLabel('USDC amount').fill('10')
  await page.getByRole('button', { name: 'Estimate bridge' }).click()
  await expect(page.getByTestId('estimate-panel')).toContainText('Destination amount')
  await expect(page.getByTestId('estimate-panel')).toContainText('Forwarding Service fee')
  await expect(page.getByRole('button', { name: 'Fast' })).toBeVisible()
}

async function completeBridge(page: import('@playwright/test').Page, scenario = 'lifecycle') {
  await page.goto(`/bridge?bridge-e2e=${scenario}`)
  await enterAmountAndEstimate(page)
  await page.getByRole('button', { name: 'Review transfer' }).click()
  await expect(page.getByRole('dialog')).toContainText('Arc Testnet (chain 5042002)')
  await page.getByRole('button', { name: 'Confirm & bridge' }).click()
}

test.describe('CCTP bridge mobile MVP', () => {
  test('renders disconnected state without requesting wallet access', async ({ page }) => {
    await page.goto('/bridge?bridge-e2e=disconnected')
    await expect(page.getByRole('button', { name: 'Estimate bridge' })).toBeDisabled()
    await expect(page.getByText(/Arc Testnet/).first()).toBeVisible()
    await expect(page.getByText('Connect a browser wallet')).toBeVisible()
  })

  test('supports only Ethereum and Base Sepolia into fixed Arc', async ({ page }) => {
    await page.goto('/bridge?bridge-e2e=ethereum')
    await expect(page.getByLabel('Source chain')).toHaveValue('Ethereum_Sepolia')
    await expect(page.getByText(/Arc Testnet/).first()).toBeVisible()

    await page.goto('/bridge?bridge-e2e=base')
    await expect(page.getByLabel('Source chain')).toHaveValue('Base_Sepolia')
    await expect(page.getByText(/Arc Testnet/).first()).toBeVisible()
  })

  test('shows wrong-network and estimate error UX', async ({ page }) => {
    await page.goto('/bridge?bridge-e2e=wrong-network')
    await expect(page.getByText('Wallet is on the wrong source network.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Estimate bridge' })).toBeDisabled()

    await page.goto('/bridge?bridge-e2e=estimate-error')
    await page.getByLabel('USDC amount').fill('10')
    await page.getByRole('button', { name: 'Estimate bridge' }).click()
    await expect(page.getByRole('alert')).toContainText('Forwarding Service estimate is temporarily unavailable')
    await expect(page.getByRole('button', { name: 'Review transfer' })).toHaveCount(0)
  })

  test('renders complete lifecycle and safe post-bridge actions', async ({ page }) => {
    await completeBridge(page)
    await expect(page.getByRole('heading', { name: 'USDC arrived on Arc Testnet' })).toBeVisible()
    await expect(page.getByRole('list').locator('li', { hasText: 'Approve USDC' })).toContainText('Complete')
    await expect(page.getByRole('list').locator('li', { hasText: 'Circle attestation' })).toContainText('Complete')
    const swap = page.getByRole('link', { name: 'Swap USDC to EURC' })
    await expect(swap).toHaveAttribute('href', /\/swap\?from=USDC&to=EURC&chain=Arc_Testnet&amount=/)
    await expect(page.getByRole('link', { name: 'Add Liquidity' })).toHaveAttribute('href', '/pools/add')
    await expect(page.getByRole('link', { name: /View destination tx/ })).toHaveAttribute('href', 'https://testnet.arcscan.app/tx/mock-mint')
  })

  test('restores and retries recoverable transfers without another burn', async ({ page }) => {
    await completeBridge(page, 'recoverable')
    await expect(page.getByTestId('recovery-card')).toContainText('It will not repeat the burn')
    await expect(page.getByRole('list').locator('li', { hasText: 'Forwarded mint on Arc' })).toContainText('Forwarding service confirmation timed out')
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByRole('heading', { name: 'USDC arrived on Arc Testnet' })).toBeVisible()

    await page.goto('/bridge?bridge-e2e=restored')
    await expect(page.getByTestId('recovery-card')).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByTestId('recovery-card')).toHaveCount(0)
  })
})
