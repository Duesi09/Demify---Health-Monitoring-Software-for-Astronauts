import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Opens a page and waits until React has taken it over. The server sends
 * complete HTML, so a button can be seen and clicked a moment before it does
 * anything; a test that clicked in that moment would fail for no good reason.
 * React marks every element it has adopted, the footer last.
 */
export async function openPage(page: Page, path: string) {
  await page.goto(path)
  await interactive(page)
}

/** As `openPage`, for a reload of the page that is open. */
export async function reloadPage(page: Page) {
  await page.reload()
  await interactive(page)
}

async function interactive(page: Page) {
  await page.waitForFunction(() => {
    const footer = document.querySelector('footer')
    return footer !== null && Object.keys(footer).some((key) => key.startsWith('__reactFiber$'))
  })
}

/** The header shared by all pages. */
export function sections(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Sections' })
}

/** Follows a header link and waits for the section to be the current one. */
export async function goToSection(page: Page, name: 'Today' | 'Check-in' | 'Earth link' | 'Radiation') {
  await sections(page).getByRole('link', { name, exact: true }).click()
  await expect(sections(page).getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page')
}

/**
 * Waits until entrance animations have ended. Cards fade in when a page opens;
 * anything measured in mid-fade (contrast, position) would not be what the
 * crew member gets to read. Markers that pulse for ever are left alone.
 */
export async function settled(page: Page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    await Promise.allSettled(finite.map((a) => a.finished))
  })
}
