import { expect, test, type Page } from '@playwright/test'
import { openPage } from './support/app'

const timeline = (page: Page) => page.getByRole('region', { name: 'Mission timeline' })
const status = (page: Page) => page.getByRole('region', { name: 'Overall health status' })

/** The day the timeline shows, read from its headline "Mission day N". */
async function shownDay(page: Page): Promise<number> {
  const text = await timeline(page)
    .getByText(/^Mission day \d+$/)
    .textContent()
  return Number(text?.replace(/\D/g, ''))
}

test.describe('Dashboard', () => {
  test('opens on the default mission day', async ({ page }) => {
    await openPage(page, '/')

    await expect(page.getByRole('heading', { level: 1, name: 'Today: mission day 42' })).toBeAttached()
    await expect(timeline(page).getByText('Mission day 42', { exact: true })).toBeVisible()
    // The address follows, so a reload or a shared link opens the same day.
    await expect(page).toHaveURL(/\/\?day=42$/)
  })

  test('day 56 is critical and day 20 is nominal', async ({ page }) => {
    await openPage(page, '/?day=56')
    await expect(status(page).getByText('Critical', { exact: true })).toBeVisible()
    await expect(status(page)).toContainText('Get the Crew Medical Officer now')
    await expect(status(page)).toContainText('2 findings need your attention')

    await openPage(page, '/?day=20')
    await expect(status(page).getByText('All nominal', { exact: true })).toBeVisible()
    await expect(status(page)).toContainText('No findings today')
  })

  test('the day control changes the day', async ({ page }) => {
    await openPage(page, '/?day=20')
    const slider = page.getByRole('slider', { name: 'Mission day' })
    await expect(slider).toHaveAttribute('aria-valuenow', '20')

    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(timeline(page).getByText('Mission day 21', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Previous day' }).click()
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(timeline(page).getByText('Mission day 19', { exact: true })).toBeVisible()

    // The timeline strip is a slider: arrow keys step by a day, Page Up by ten, End goes to the last day.
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await expect(slider).toHaveAttribute('aria-valuenow', '20')
    await page.keyboard.press('PageUp')
    await expect(slider).toHaveAttribute('aria-valuenow', '30')
    await page.keyboard.press('End')
    await expect(slider).toHaveAttribute('aria-valuetext', /^Mission day 180, /)
    await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()

    // The rest of the page follows the day: day 56 is the life-support fault.
    await page.keyboard.press('Home')
    await expect(page.getByRole('button', { name: 'Previous day' })).toBeDisabled()
    for (let press = 0; press < 5; press++) await page.keyboard.press('PageUp')
    for (let press = 0; press < 5; press++) await page.keyboard.press('ArrowRight')
    await expect(timeline(page).getByText('Mission day 56', { exact: true })).toBeVisible()
    await expect(status(page).getByText('Critical', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/\?day=56$/)
  })

  test('the time-lapse plays and pauses', async ({ page }) => {
    await openPage(page, '/?day=20')

    await page.getByRole('button', { name: 'Play time-lapse' }).click()
    const pause = page.getByRole('button', { name: 'Pause' })
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => shownDay(page)).toBeGreaterThan(22)

    await pause.click()
    await expect(page.getByRole('button', { name: 'Play time-lapse' })).toHaveAttribute('aria-pressed', 'false')
    const pausedOn = await shownDay(page)
    // The address is only written while the time-lapse stands still, and it names the day it stopped on.
    await expect(page).toHaveURL(new RegExp(`\\?day=${pausedOn}$`))
    expect(await shownDay(page)).toBe(pausedOn)
  })
})
