import { expect, test } from '@playwright/test'
import { openPage } from './support/app'

// In a file of its own, so its 30 seconds pass alongside the other tests.
// It saves a reaction time for day 120, a day no other test looks at, and
// never reads it back from the server, so it does not matter that the
// check-in tests clear the log of manual readings meanwhile.
test.describe('Reaction Self-Test', () => {
  test('the 30 second demo counts a false start, runs to a result and saves it', async ({ page }) => {
    // The demo lasts 30 seconds of real time; nothing here can make it shorter.
    test.setTimeout(90_000)
    await openPage(page, '/checkin?day=120&step=reactionMs')

    await page.getByRole('radio', { name: /Demo \| 30 seconds/ }).check()
    await page.getByRole('button', { name: 'Get ready' }).click()
    await expect(page.getByRole('heading', { name: 'Ready for the demo?' })).toBeVisible()
    await page.getByRole('button', { name: 'Begin test' }).click()

    const box = page.locator('[data-reaction-box]')
    const stimulus = page.locator('[data-reaction-box][data-state="shown"]')
    const result = page.getByRole('heading', { name: 'Your result (demo run)' })

    // A press before the counter appears is a false start.
    await expect(box).toHaveAttribute('data-state', 'waiting')
    await page.keyboard.press('Space')
    await expect(box).toHaveAttribute('data-state', 'frozen')
    await expect(box).toContainText('Too early. Wait for the counter.')

    // From here on, respond to every counter, as an attentive crew member would.
    let responses = 0
    for (;;) {
      await expect(stimulus.or(result)).toBeVisible()
      if (await result.isVisible()) break
      // Anything faster than 100 ms counts as a guess, so respond once the counter has passed 150.
      await expect(stimulus).toHaveText(/^(1[5-9]\d|[2-9]\d\d|\d{4})/)
      await page.keyboard.press('Space')
      await expect(box).toHaveAttribute('data-state', 'frozen')
      responses++
    }

    // The demo needs at least 5 valid responses for a result; every counter was answered.
    expect(responses).toBeGreaterThanOrEqual(5)
    await expect(page.getByText('ms mean reaction time')).toBeVisible()
    await expect(page.getByText(`Mean of ${responses} valid responses to ${responses} counters.`)).toBeVisible()
    await expect(page.locator('dt:text-is("False starts") + dd')).toHaveText('1')
    await expect(page.getByText('Demo run of 30 seconds.')).toBeVisible()

    await page.getByRole('button', { name: /^Save \d+ ms for mission day 120$/ }).click()
    await expect(page.getByText('Saved as the reaction time for mission day 120')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'All steps' }).getByRole('button', { name: /^Reaction time/ }),
    ).toContainText('entered by you')
  })
})
