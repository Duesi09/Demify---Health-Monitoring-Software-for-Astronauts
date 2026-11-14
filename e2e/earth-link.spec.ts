import { expect, test, type Page } from '@playwright/test'
import { openPage } from './support/app'

const place = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Where you are' }).getByRole('button', { name, exact: true })
const consult = (page: Page) => page.getByRole('region', { name: 'Consult the flight surgeon' })
const ledger = (page: Page) => page.getByRole('region', { name: 'Light-time ledger' })

test.describe('Earth link', () => {
  test('the Mars transit on day 97 is 4 min 56 s from Earth, one way', async ({ page }) => {
    await openPage(page, '/link?day=97')

    await expect(place(page, 'Mars transit')).toHaveAttribute('aria-pressed', 'true')
    const earth = page.getByRole('region', { name: 'Earth from where you are' })
    const oneWay = earth.locator('dt:text-is("One-way signal time") + dd')
    await expect(oneWay).toContainText('4 min 56 s')
    await expect(oneWay).toContainText('Round trip 9 min 52 s')
    await expect(earth).toContainText('Everyone who can help you is there, 4 min 56 s away.')
    await expect(page.getByText('Earth sees you as you were 4 min 56 s ago.')).toBeVisible()
    await expect(consult(page).locator('dt:text-is("Reaches Earth after") + dd')).toHaveText('4 min 56 s')
    await expect(consult(page).locator('dt:text-is("Earliest answer after") + dd')).toHaveText('19 min 52 s')
  })

  test('behind the Sun nothing can be sent', async ({ page }) => {
    await openPage(page, '/link?day=97')
    const send = consult(page).getByRole('button', { name: 'Send to the flight surgeon' })
    await expect(send).toBeVisible()

    await place(page, 'Behind the Sun').click()

    await expect(place(page, 'Behind the Sun')).toHaveAttribute('aria-pressed', 'true')
    await expect(send).toHaveCount(0)
    await expect(consult(page).getByRole('button')).toHaveCount(0)
    await expect(consult(page).getByText('No contact with Earth')).toBeVisible()
    await expect(consult(page)).toContainText('From behind the Sun nothing can be sent.')
    await expect(ledger(page)).toContainText('From behind the Sun, none can be sent.')
    // The chosen place is in the address, so a shared link opens the same view.
    await expect(page).toHaveURL(/\/link\?day=97&profile=blackout$/)

    await place(page, 'Mars transit').click()
    await expect(send).toBeVisible()
  })

  test('a consult sent with the fast-forward ends in a reply labelled as simulated', async ({ page }) => {
    // The page's own fast-forward still needs 20 real seconds for this consult.
    // The test owns the browser clock instead and moves it on, so nothing is waited out.
    await page.clock.install()
    await openPage(page, '/link?day=97')

    await ledger(page).getByRole('button', { name: '60 times faster' }).click()
    await expect(ledger(page).getByRole('button', { name: '60 times faster' })).toHaveAttribute('aria-pressed', 'true')
    await expect(ledger(page)).toContainText('the ship clock is running 60 times faster than real time')

    await consult(page).getByRole('button', { name: 'Send to the flight surgeon' }).click()
    await expect(consult(page).getByRole('button', { name: 'Consult on its way' })).toBeVisible()
    const entry = ledger(page).getByRole('listitem').filter({ hasText: 'Possible heart attack' })
    await expect(entry).toContainText('Mission day 97 | Mars transit | Critical')
    await expect(entry).toContainText('In transit to Earth')
    await expect(entry.getByText('Simulated reply')).toHaveCount(0)

    // 25 seconds at 60 times the speed are 25 minutes on the ship; the earliest answer needs 19 min 52 s.
    await page.clock.fastForward(25_000)

    await expect(entry.getByText('Simulated reply', { exact: true })).toBeVisible()
    await expect(entry).toContainText('Answered after 19 min 52 s')
    await expect(entry).toContainText('From Earth | after 19 min 52 s')
    await expect(entry).toContainText('Flight surgeon, mission control')
    await expect(consult(page).getByRole('button', { name: 'Send again' })).toBeVisible()
    await expect(ledger(page)).toContainText('Replies from Earth are simulated.')
  })
})
