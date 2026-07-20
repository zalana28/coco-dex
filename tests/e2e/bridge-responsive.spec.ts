import { expect, test, type Locator, type Page } from '@playwright/test'

const address = `0x${'f'.repeat(40)}`

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(widths.document, `document overflow: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(widths.viewport)
  expect(widths.body, `body overflow: ${JSON.stringify(widths)}`).toBeLessThanOrEqual(widths.viewport)
}

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  expect(value).not.toBeNull()
  return value!
}

async function openEstimatedBridge(page: Page, scenario = 'lifecycle') {
  await page.goto(`/bridge?bridge-e2e=${scenario}`)
  await expect(page.getByRole('heading', { name: 'Bridge USDC to Arc' })).toBeVisible()
  await page.getByLabel('Recipient on Arc').fill(address)
  await page.getByLabel('USDC amount').fill('10')
  await page.getByRole('button', { name: 'Estimate bridge' }).click()
  await expect(page.getByTestId('estimate-panel')).toContainText('Destination amount')
}

test.describe('Bridge responsive layout', () => {
  test('balances form fields and sidebar at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openEstimatedBridge(page)

    const amount = await box(page.getByLabel('USDC amount'))
    const recipient = await box(page.getByLabel('Recipient on Arc'))
    const estimate = await box(page.getByTestId('estimate-panel'))

    expect(recipient.width).toBeGreaterThan(amount.width * 1.25)
    expect(estimate.width).toBeGreaterThanOrEqual(320)
    expect(estimate.width).toBeLessThanOrEqual(430)
    expect(recipient.x).toBeGreaterThan(amount.x)
    await expectNoHorizontalOverflow(page)
  })

  test('switches to one page column before 1024px content becomes cramped', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await openEstimatedBridge(page)

    const amount = await box(page.getByLabel('USDC amount'))
    const recipient = await box(page.getByLabel('Recipient on Arc'))
    const estimate = await box(page.getByTestId('estimate-panel'))

    expect(recipient.width).toBeGreaterThan(amount.width * 1.2)
    expect(estimate.y).toBeGreaterThan(recipient.y + recipient.height)
    await expectNoHorizontalOverflow(page)
  })

  test('keeps the bounded sidebar balanced at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openEstimatedBridge(page)
    const layout = await box(page.getByTestId('bridge-layout'))
    const sidebar = await box(page.getByTestId('bridge-sidebar'))
    expect(sidebar.width).toBeGreaterThanOrEqual(320)
    expect(sidebar.width).toBeLessThanOrEqual(400)
    expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(layout.x + layout.width)
    await expectNoHorizontalOverflow(page)
  })

  for (const width of [320, 360, 390, 412, 768]) {
    test(`keeps the form and long recipient contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 800 })
      await openEstimatedBridge(page)

      const amount = await box(page.getByLabel('USDC amount'))
      const recipient = await box(page.getByLabel('Recipient on Arc'))
      const source = await box(page.getByLabel('Source chain'))
      const destination = await box(page.getByTestId('bridge-destination'))

      if (width < 768) {
        expect(destination.y).toBeGreaterThan(source.y + source.height - 1)
        expect(recipient.y).toBeGreaterThan(amount.y + amount.height)
      } else {
        expect(destination.y).toBeLessThan(source.y + source.height)
        expect(recipient.width).toBeGreaterThan(amount.width * 1.2)
      }
      expect(recipient.x).toBeGreaterThanOrEqual(0)
      expect(recipient.x + recipient.width).toBeLessThanOrEqual(width)
      const recipientWidths = await page.getByLabel('Recipient on Arc').evaluate((input) => ({ scroll: input.scrollWidth, client: input.clientWidth }))
      expect(recipientWidths.scroll).toBeGreaterThanOrEqual(recipientWidths.client)
      if (width < 768) expect(recipientWidths.scroll).toBeGreaterThan(recipientWidths.client)
      await expectNoHorizontalOverflow(page)
    })
  }

  test('associates recipient label, helper, and inline validation error', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/bridge?bridge-e2e=ethereum')
    const recipient = page.getByLabel('Recipient on Arc')
    await recipient.fill('not-an-address')

    await expect(recipient).toHaveAttribute('id', 'bridge-recipient')
    await expect(recipient).toHaveAttribute('aria-describedby', /bridge-recipient-help/)
    await expect(recipient).toHaveAttribute('aria-describedby', /bridge-recipient-error/)
    await expect(page.getByText('Enter a valid Arc recipient address')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('associates amount validation with an accessible reason', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/bridge?bridge-e2e=ethereum')
    const amount = page.getByLabel('USDC amount')
    await amount.fill('not-an-amount')

    await expect(amount).toHaveAttribute('aria-invalid', 'true')
    await expect(amount).toHaveAttribute('aria-describedby', /bridge-amount-error/)
    await expect(page.getByText('Enter a valid USDC amount.')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('traps dialog focus, closes with Escape, and restores the trigger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openEstimatedBridge(page)
    const trigger = page.getByRole('button', { name: 'Review transfer' })
    await trigger.focus()
    await trigger.click()

    const dialog = page.getByRole('dialog', { name: 'Confirm bridge' })
    await expect(dialog).toBeVisible()
    const cancel = dialog.getByRole('button', { name: 'Cancel' })
    const confirm = dialog.getByRole('button', { name: 'Confirm & bridge' })
    await expect(cancel).toBeFocused()
    await expect(page.getByTestId('bridge-page-content')).toHaveAttribute('inert', '')
    await cancel.press('Shift+Tab')
    await expect(confirm).toBeFocused()
    await confirm.press('Tab')
    await expect(cancel).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('announces one lifecycle update and bridge success as statuses', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/bridge?bridge-e2e=pending-burn')
    const lifecycleStatus = page.getByRole('status', { name: 'Bridge lifecycle update' })
    await expect(lifecycleStatus).toContainText('Burn on source: Pending')
    await expect(page.getByRole('list')).not.toHaveAttribute('aria-live')

    await openEstimatedBridge(page, 'lifecycle')
    await page.getByRole('button', { name: 'Review transfer' }).click()
    await page.getByRole('button', { name: 'Confirm & bridge' }).click()
    await expect(page.getByRole('status', { name: 'Bridge completed' })).toContainText('USDC arrived on Arc Testnet')
  })

  test('stacks wrong-network warning action at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/bridge?bridge-e2e=wrong-network')
    const message = await box(page.getByText('Wallet is on the wrong source network.'))
    const action = await box(page.getByRole('button', { name: 'Switch to Ethereum Sepolia' }))

    expect(action.y).toBeGreaterThan(message.y + message.height)
    expect(action.width).toBeGreaterThanOrEqual(200)
    await expectNoHorizontalOverflow(page)
  })

  test('contains lifecycle, recovery, errors, and post-success actions at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await openEstimatedBridge(page, 'recoverable')
    await page.getByRole('button', { name: 'Review transfer' }).click()
    await page.getByRole('button', { name: 'Confirm & bridge' }).click()

    await expect(page.getByTestId('recovery-card')).toBeVisible()
    for (const label of ['Approve USDC', 'Burn on source', 'Circle attestation', 'Forwarded mint on Arc']) {
      const row = page.getByRole('list').locator('li', { hasText: label })
      const rowBox = await box(row)
      expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(320)
    }
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: 'Resume' }).click()
    for (const name of ['Swap USDC to EURC', 'Add Liquidity', /View destination tx/]) {
      const action = page.getByRole('link', { name })
      await expect(action).toBeVisible()
      expect((await box(action)).width).toBeGreaterThanOrEqual(240)
    }
    await expectNoHorizontalOverflow(page)
  })

  test('wraps a long SDK error without widening the 320px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/bridge?bridge-e2e=long-error')
    await page.getByLabel('USDC amount').fill('10')
    await page.getByRole('button', { name: 'Estimate bridge' }).click()
    await expect(page.getByRole('alert')).toContainText('source RPC provider returned a response')
    await expectNoHorizontalOverflow(page)
  })

  test('contains loading, insufficient, and pending lifecycle states', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/bridge?bridge-e2e=balance-loading')
    await page.getByLabel('USDC amount').fill('10')
    await expect(page.getByText('Balance: Loading…')).toBeVisible()
    await expect(page.getByText('Source balances are still loading.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Estimate bridge' })).toBeDisabled()
    await expectNoHorizontalOverflow(page)

    await page.goto('/bridge?bridge-e2e=insufficient-usdc')
    await page.getByLabel('USDC amount').fill('10')
    await expect(page.getByText('Insufficient source USDC.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Estimate bridge' })).toBeDisabled()
    await expectNoHorizontalOverflow(page)

    await page.goto('/bridge?bridge-e2e=insufficient-gas')
    await page.getByLabel('USDC amount').fill('10')
    await expect(page.getByText('Insufficient ETH for source gas.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Estimate bridge' })).toBeDisabled()
    await expectNoHorizontalOverflow(page)

    for (const [scenario, label, status] of [['pending-approve', 'Approve USDC', 'Waiting'], ['pending-burn', 'Burn on source', 'Confirming on Ethereum Sepolia'], ['pending-attestation', 'Circle attestation', 'Waiting for Circle'], ['pending-mint', 'Forwarded mint on Arc', 'Forwarding Service processing']] as const) {
      await page.goto(`/bridge?bridge-e2e=${scenario}`)
      await expect(page.getByRole('list').locator('li', { hasText: label })).toContainText(status)
      await expectNoHorizontalOverflow(page)
    }
  })

  test('captures documented responsive review evidence', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    test.skip(testInfo.project.name !== 'Pixel 5' || testInfo.repeatEachIndex > 0, 'Single deterministic evidence set')
    const capture = async (name: string, path: string, width: number, height: number, action?: () => Promise<void>) => {
      await page.setViewportSize({ width, height })
      await page.goto(path)
      await expect(page.getByRole('heading', { name: 'Bridge USDC to Arc' })).toBeVisible()
      await action?.()
      const screenshot = await page.screenshot({ fullPage: true })
      await testInfo.attach(name, { body: screenshot, contentType: 'image/png' })
    }
    await capture('desktop-default', '/bridge?bridge-e2e=ethereum', 1440, 900)
    await capture('desktop-wrong-network', '/bridge?bridge-e2e=wrong-network', 1440, 900)
    await capture('mobile-default', '/bridge?bridge-e2e=ethereum', 320, 700)
    await capture('mobile-wrong-network', '/bridge?bridge-e2e=wrong-network', 320, 700)
    await capture('mobile-estimate-success', '/bridge?bridge-e2e=ethereum', 320, 700, async () => {
      await page.getByLabel('USDC amount').fill('10')
      await page.getByRole('button', { name: 'Estimate bridge' }).click()
    })
    await capture('mobile-recoverable-error', '/bridge?bridge-e2e=recoverable', 320, 700, async () => {
      await page.getByLabel('USDC amount').fill('10')
      await page.getByRole('button', { name: 'Estimate bridge' }).click()
      await page.getByRole('button', { name: 'Review transfer' }).click()
      await page.getByRole('button', { name: 'Confirm & bridge' }).click()
    })
    await capture('mobile-bridge-success', '/bridge?bridge-e2e=lifecycle', 320, 700, async () => {
      await page.getByLabel('USDC amount').fill('10')
      await page.getByRole('button', { name: 'Estimate bridge' }).click()
      await page.getByRole('button', { name: 'Review transfer' }).click()
      await page.getByRole('button', { name: 'Confirm & bridge' }).click()
    })
  })
})
