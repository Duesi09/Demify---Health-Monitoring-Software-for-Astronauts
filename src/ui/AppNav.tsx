import Link from 'next/link'

export type AppSection = 'today' | 'checkin' | 'link' | 'radiation'

const SECTIONS: { id: AppSection; label: string; href: string }[] = [
  { id: 'today', label: 'Today', href: '/' },
  { id: 'checkin', label: 'Check-in', href: '/checkin' },
  { id: 'link', label: 'Earth link', href: '/link' },
  { id: 'radiation', label: 'Radiation', href: '/radiation' },
]

/**
 * The header shared by every page: the product name, the sections and the
 * crew member. Links carry the mission day, so each section opens on the same day.
 */
export function AppNav({ current, day }: { current: AppSection; day: number }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="text-4xl font-semibold tracking-tight">
        Demify <span className="text-ink-2">Crew Health Monitor</span>
      </p>
      <nav aria-label="Sections" className="flex flex-wrap gap-1 rounded-full bg-white/[0.06] p-1 ring-1 ring-edge">
        {SECTIONS.map((section) => (
          <Link
            key={section.id}
            href={`${section.href}?day=${day}`}
            aria-current={section.id === current ? 'page' : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              section.id === current ? 'bg-ink text-page' : 'text-ink-2 hover:bg-white/[0.08] hover:text-ink'
            }`}
          >
            {section.label}
          </Link>
        ))}
      </nav>
      <p className="rounded-full bg-white/[0.06] px-4 py-1.5 text-sm text-ink-2 ring-1 ring-edge">
        Flight Engineer A. Morgan | simulated crew member
      </p>
    </header>
  )
}
