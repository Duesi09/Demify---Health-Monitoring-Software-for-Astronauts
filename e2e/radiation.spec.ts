import { expect, test, type Locator } from '@playwright/test'
import { openPage, settled } from './support/app'

/** Distance of an element's top edge from the top of the page. */
async function topOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The element is not on screen.')
  return box.y
}

test.describe('Radiation', () => {
  test('day 148 leads with the shelter procedure', async ({ page }) => {
    await openPage(page, '/radiation?day=148')

    const procedure = page.getByRole('region', { name: 'Solar particle event. Take shelter now.' })
    await expect(procedure).toBeVisible()
    await expect(procedure.getByText('Act | Solar particle event')).toBeVisible()
    await expect(procedure).toContainText('Go to the storm shelter')
    await expect(procedure.locator('dt:has-text("Dose rate today") + dd')).toContainText('43.1')
    // A real event is never dressed as a drill.
    await expect(procedure.getByText('DRILL', { exact: true })).toHaveCount(0)

    // It comes before everything else the page has to say.
    await settled(page)
    const dose = page.getByRole('heading', { name: 'Mission dose', exact: true })
    expect(await topOf(procedure)).toBeLessThan(await topOf(dose))
    await expect(page.getByRole('button', { name: 'Start the drill' })).toHaveCount(0)
  })

  test('on day 148 a step can be ticked and a clock started', async ({ page }) => {
    await openPage(page, '/radiation?day=148')
    const procedure = page.getByRole('region', { name: 'Solar particle event. Take shelter now.' })

    await expect(procedure.getByText('0 of 7 steps done')).toBeVisible()
    const firstStep = procedure.getByRole('checkbox', { name: /Stop outside work\. Get everyone inside\./ })
    await firstStep.check()
    await expect(firstStep).toBeChecked()
    await expect(procedure.getByText('1 of 7 steps done')).toBeVisible()
    await expect(procedure.getByRole('button', { name: 'Clear all ticks' })).toBeEnabled()

    const alarm = procedure.getByRole('region', { name: 'Time since the alarm' })
    const timer = alarm.getByRole('timer')
    await expect(timer).toHaveText('00:00:00')
    await expect(alarm.getByText('Not started.')).toBeVisible()

    await alarm.getByRole('button', { name: 'Start: Time since the alarm' }).click()
    await expect(alarm.getByRole('button', { name: 'Pause: Time since the alarm' })).toBeVisible()
    await expect(alarm.getByText(/^Running\. .* left to the 1 hour target\.$/)).toBeVisible()
    await expect(timer).not.toHaveText('00:00:00')
    // The other clock is its own: it has not moved.
    await expect(procedure.getByRole('region', { name: 'Time in the shelter' }).getByRole('timer')).toHaveText(
      '00:00:00',
    )

    await alarm.getByRole('button', { name: 'Pause: Time since the alarm' }).click()
    await expect(alarm.getByRole('button', { name: 'Resume: Time since the alarm' })).toBeVisible()
    await expect(alarm.getByText(/^Paused\./)).toBeVisible()
  })

  test('on day 20 the drill can be started and is marked as a drill', async ({ page }) => {
    await openPage(page, '/radiation?day=20')
    await expect(page.getByRole('heading', { name: /Take shelter now/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Start the drill' }).click()

    const drill = page.getByRole('region', { name: 'Drill: storm shelter procedure' })
    await expect(drill).toBeVisible()
    await expect(drill.getByText('DRILL', { exact: true })).toBeVisible()
    await expect(drill).toContainText('This is a drill. No solar particle event is in progress.')
    await expect(drill.getByText('Rehearsal | example readings')).toBeVisible()
    await expect(drill.getByRole('heading', { name: 'Checklist (drill)' })).toBeVisible()
    await expect(drill.getByText('Drill example', { exact: true })).toBeVisible()
    // Opening the drill takes the keyboard there.
    await expect(drill.getByRole('heading', { name: 'Drill: storm shelter procedure' })).toBeFocused()

    await drill.getByRole('button', { name: 'End the drill' }).click()
    await expect(drill).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start the drill' })).toBeFocused()
  })
})
