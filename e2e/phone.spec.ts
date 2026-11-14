import { expect, test } from '@playwright/test'
import { openPage, settled } from './support/app'

// A small phone held upright, with touch and a phone's way of laying out a page.
test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })

// The days on which each page has the most on it.
const PAGES = [
  { name: 'dashboard', path: '/?day=56', title: 'Today: mission day 56' },
  { name: 'check-in', path: '/checkin?day=89', title: 'Check-in' },
  { name: 'Earth link', path: '/link?day=97', title: 'Earth link' },
  { name: 'radiation', path: '/radiation?day=148', title: 'Radiation' },
]

test.describe('Phone width', () => {
  for (const { name, path, title } of PAGES) {
    test(`no sideways scrolling: ${name}`, async ({ page }) => {
      await openPage(page, path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await settled(page)

      const { content, screen } = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        screen: document.documentElement.clientWidth,
      }))
      expect(screen).toBe(360)
      expect(content, 'the page is wider than the screen').toBeLessThanOrEqual(screen)
    })
  }
})
