'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'

/** Shown when the dashboard fails to load, so the crew member is never left with a blank screen. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-semibold text-ink">The health monitor could not load</h1>
      <p className="text-lg text-ink-2">
        Readings that were already saved stay on the on-board computer. If you feel unwell, do not wait for
        this screen: contact the Crew Medical Officer directly.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="self-start rounded-full bg-action px-5 py-2.5 font-semibold text-white hover:brightness-110"
      >
        Try again
      </button>
    </main>
  )
}
