import { AppNav, type AppSection } from './AppNav'

/** The frame of every page except the dashboard: header, content column and the standing disclaimer. */
export function PageShell({
  current,
  day,
  children,
}: {
  current: AppSection
  day: number
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <AppNav current={current} day={day} />
      <main className="@container flex min-w-0 flex-col gap-5">{children}</main>
      <footer className="pt-2 text-xs text-muted">
        <p>
          Prototype for the NASA Space Apps Challenge. Reference ranges are demo defaults and not medical advice.
        </p>
      </footer>
    </div>
  )
}
