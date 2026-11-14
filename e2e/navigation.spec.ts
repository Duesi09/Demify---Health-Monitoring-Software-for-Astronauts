import { expect, test, type Page } from '@playwright/test'
import { goToSection, openPage, sections } from './support/app'

const pageTitle = (page: Page) => page.getByRole('heading', { level: 1 })

// Some pages complete their address a moment after they open (the dashboard
// adds the day, the Earth link the place). Each step below waits for the full
// address before it clicks on, as a crew member reading the page would.
test.describe('Navigation', () => {
  test('header links keep the mission day', async ({ page }) => {
    await openPage(page, '/?day=56')

    await goToSection(page, 'Check-in')
    await expect(page).toHaveURL(/\/checkin\?day=56$/)
    await expect(pageTitle(page)).toHaveText('Check-in')
    await expect(page.getByText('Mission day 56 of 180')).toBeVisible()

    await goToSection(page, 'Earth link')
    await expect(page).toHaveURL(/\/link\?day=56&profile=transit$/)
    await expect(pageTitle(page)).toHaveText('Earth link')
    await expect(page.getByText('Mission day 56 of 180')).toBeVisible()

    await goToSection(page, 'Radiation')
    await expect(page).toHaveURL(/\/radiation\?day=56$/)
    await expect(pageTitle(page)).toHaveText('Radiation')
    await expect(page.getByText('Mission day 56 of 180')).toBeVisible()

    // A day chosen inside a section travels on with the header links.
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page).toHaveURL(/\/radiation\?day=57$/)
    for (const [name, href] of [
      ['Today', '/?day=57'],
      ['Check-in', '/checkin?day=57'],
      ['Earth link', '/link?day=57'],
    ]) {
      await expect(sections(page).getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
    }
    await goToSection(page, 'Today')
    await expect(page).toHaveURL(/\/\?day=57$/)
    await expect(pageTitle(page)).toHaveText('Today: mission day 57')
  })

  // Regression: the page once wrote the day into the address before the router
  // had set up its history entry. Back then changed the address but not the page.
  test('Back and Forward return to the right page', async ({ page }) => {
    // A fresh load without a day, so the page itself writes the day into the address.
    await openPage(page, '/')
    await expect(page).toHaveURL(/\/\?day=42$/)

    await goToSection(page, 'Radiation')
    await expect(page).toHaveURL(/\/radiation\?day=42$/)
    await expect(pageTitle(page)).toHaveText('Radiation')

    await goToSection(page, 'Earth link')
    await expect(page).toHaveURL(/\/link\?day=42&profile=transit$/)
    await expect(pageTitle(page)).toHaveText('Earth link')

    await page.goBack()
    await expect(page).toHaveURL(/\/radiation\?day=42$/)
    await expect(pageTitle(page)).toHaveText('Radiation')
    await expect(page.getByRole('heading', { name: 'Mission dose', exact: true })).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/\?day=42$/)
    await expect(pageTitle(page)).toHaveText('Today: mission day 42')
    await expect(page.getByRole('region', { name: 'Mission timeline' })).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(/\/radiation\?day=42$/)
    await expect(pageTitle(page)).toHaveText('Radiation')

    await page.goForward()
    await expect(page).toHaveURL(/\/link\?day=42&profile=transit$/)
    await expect(pageTitle(page)).toHaveText('Earth link')
    await expect(page.getByRole('heading', { name: 'Light-time ledger' })).toBeVisible()

    // A page that came back is alive: its own controls respond.
    await page.goBack()
    await expect(pageTitle(page)).toHaveText('Radiation')
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByText('Mission day 41 of 180')).toBeVisible()
    await expect(page).toHaveURL(/\/radiation\?day=41$/)
  })

  // Both were defects of the delayed address write in src/ui/useAddress.ts.

  test('a header link clicked while the address is still being completed is followed', async ({ page }) => {
    // A slow link: the next page takes longer to arrive than the address write waits.
    await page.route(/\/radiation\?/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      await route.continue()
    })
    await openPage(page, '/')
    await sections(page).getByRole('link', { name: 'Radiation', exact: true }).click()
    await expect(pageTitle(page)).toHaveText('Radiation')
  })

  test('Back returns to the day that was last shown', async ({ page }) => {
    await openPage(page, '/?day=50')
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page).toHaveURL(/\/\?day=51$/)
    await goToSection(page, 'Radiation')
    await expect(page).toHaveURL(/\/radiation\?day=51$/)

    await page.goBack()
    await expect(pageTitle(page)).toHaveText('Today: mission day 51')
  })
})
