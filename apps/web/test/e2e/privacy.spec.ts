import { expect, test } from '@playwright/test'

test('opens and closes the front-page privacy dialog', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 700 })
  }

  await page.goto('/')

  const trigger = page.getByTestId('privacy-open')
  const dialog = page.getByTestId('privacy-dialog')
  const closeButton = page.getByTestId('privacy-close')
  const themeButton = page.getByTestId('theme-wasteland')

  await trigger.click()
  await expect(dialog).toBeVisible()
  await expect(closeButton).toBeFocused()
  await expect(themeButton.click({ timeout: 500 })).rejects.toThrow()
  await expect(page).toHaveURL('/')
  await expect(dialog).toBeVisible()

  expect(
    await page.evaluate(() => {
      const privacyDialog = document.querySelector(
        '[data-testid="privacy-dialog"]',
      )
      return {
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
        dialogFits:
          privacyDialog instanceof HTMLElement &&
          privacyDialog.scrollWidth <= privacyDialog.clientWidth,
      }
    }),
  ).toEqual({ pageFits: true, dialogFits: true })

  await page.screenshot({
    path: testInfo.outputPath('privacy-dialog.png'),
    fullPage: true,
  })

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await closeButton.click()
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})
