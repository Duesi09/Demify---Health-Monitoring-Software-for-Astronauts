import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openPage, settled } from './support/app'

// Each page on a quiet day and on a day when it has the most to say.
const PAGES = [
  { name: 'dashboard, nominal day', path: '/?day=20' },
  { name: 'dashboard, critical day', path: '/?day=56' },
  { name: 'check-in, nothing due', path: '/checkin?day=20' },
  { name: 'check-in, a measurement due', path: '/checkin?day=89' },
  { name: 'Earth link, near Earth', path: '/link?day=20&profile=moon' },
  { name: 'Earth link, critical finding in the Mars transit', path: '/link?day=97' },
  { name: 'radiation, quiet day', path: '/radiation?day=20' },
  { name: 'radiation, solar particle event', path: '/radiation?day=148' },
]

test.describe('Accessibility (WCAG 2.2, levels A and AA)', () => {
  for (const { name, path } of PAGES) {
    test(`no violations: ${name}`, async ({ page }) => {
      await openPage(page, path)
      await settled(page)

      const { violations, incomplete } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()

      // Listed by rule and element, so a failure says what to fix.
      const found = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
      expect(found).toEqual([])

      // What axe cannot decide it reports apart, and that is a limit of this test:
      // the cards have a gradient behind them, so for most text axe cannot work out
      // the contrast and neither passes nor fails it. Contrast needs a check by eye
      // or by a tool that samples pixels. Nothing else may be left undecided.
      expect(incomplete.map((rule) => rule.id).filter((id) => id !== 'color-contrast')).toEqual([])
    })
  }
})
