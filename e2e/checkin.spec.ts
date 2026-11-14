import { expect, test, type Page } from '@playwright/test'
import { openPage, reloadPage } from './support/app'

const remove = (page: Page) => page.getByRole('button', { name: /^Remove my \d+ manual readings?$/ })

// These tests save blood pressure for day 90 on the server. They run in order,
// in one worker, and each starts by clearing the log of manual readings, so
// none depends on another's leftovers and a repeated run finds the same
// starting point. No other file looks at day 90 or clears the log.
test.beforeEach(async ({ page }) => {
  await openPage(page, '/?day=90')
  if (await remove(page).isVisible()) {
    await remove(page).click()
    await expect(remove(page)).toBeHidden()
  }
})

const routine = (page: Page) => page.getByRole('heading', { level: 2, name: /measurements? due|Nothing is due/ })
const steps = (page: Page) => page.getByRole('navigation', { name: 'All steps' })

test.describe('Check-in', () => {
  test('a due measurement is saved, survives a reload and reaches the dashboard', async ({ page }) => {
    await openPage(page, '/checkin?day=90')

    await expect(routine(page)).toHaveText('1 measurement due')
    await expect(page.getByText('Out of date: Blood pressure.')).toBeVisible()
    await expect(steps(page).getByRole('button', { name: /^Blood pressure/ })).toContainText('Due')
    // The step that is due is already open.
    await expect(page.getByRole('heading', { name: 'Enter the reading for mission day 90' })).toBeVisible()

    await page.getByLabel('Systolic pressure').fill('118')
    await page.getByLabel('Diastolic pressure').fill('76')
    await page.getByRole('button', { name: 'Save reading' }).click()

    await expect(page.getByText('Saved for mission day 90: Blood pressure 118/76 mmHg')).toBeVisible()
    await expect(routine(page)).toHaveText('Nothing is due')
    await expect(page.getByText('11 of 11 indicators have a reading from today.')).toBeVisible()
    const bloodPressure = steps(page).getByRole('button', { name: /^Blood pressure/ })
    await expect(bloodPressure).toContainText('118/76 mmHg | entered by you')
    await expect(bloodPressure).not.toContainText('Due')

    await reloadPage(page)
    await expect(routine(page)).toHaveText('Nothing is due')
    await expect(steps(page).getByRole('button', { name: /^Blood pressure/ })).toContainText(
      '118/76 mmHg | entered by you',
    )

    await openPage(page, '/?day=90')
    await expect(
      page.getByRole('region', { name: 'Other sections' }).getByRole('link', { name: /^Check-in/ }),
    ).toContainText('11 of 11 measured today')
    await expect(
      page
        .getByRole('region', { name: 'Vital signs monitor' })
        .getByRole('button', { name: /^Blood pressure 118\/76 mmHg/ }),
    ).toBeVisible()
    await expect(remove(page)).toBeVisible()
  })

  test('a value out of range shows an error next to the field and saves nothing', async ({ page }) => {
    await openPage(page, '/checkin?day=90')
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Save reading' }) })
    const systolic = form.getByLabel('Systolic pressure')
    const diastolic = form.getByLabel('Diastolic pressure')

    await systolic.fill('300')
    await diastolic.fill('76')
    await page.getByRole('button', { name: 'Save reading' }).click()

    // The message belongs to the field: it is announced with it, and the field takes the focus.
    const error = form.getByRole('alert')
    await expect(error).toHaveText('Enter a value between 50 and 260 mmHg.')
    await expect(systolic).toHaveAccessibleDescription(/Enter a value between 50 and 260 mmHg\./)
    await expect(systolic).toHaveAttribute('aria-invalid', 'true')
    await expect(systolic).toBeFocused()
    await expect(diastolic).not.toHaveAttribute('aria-invalid', 'true')

    // Correcting the value clears the message. Nothing was saved in between.
    await systolic.fill('118')
    await expect(error).toHaveCount(0)
    await reloadPage(page)
    await expect(routine(page)).toHaveText('1 measurement due')
  })
})
