import type { Metadata } from 'next'
import { getMissionReadings } from '@/server/mission'
import { CheckIn } from '@/ui/checkin/CheckIn'
import { PageShell } from '@/ui/PageShell'
import { parseDay } from '../day'

export const metadata: Metadata = { title: 'Check-in | Demify' }

// Readings change whenever a crew member logs one, so never serve a cached page.
export const dynamic = 'force-dynamic'

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string | string[]; step?: string | string[] }>
}) {
  const [{ day: dayParam, step }, readings] = await Promise.all([searchParams, getMissionReadings()])
  const day = parseDay(dayParam)
  return (
    <PageShell current="checkin" day={day}>
      {/* Keyed by day: another day is another check-in, with nothing carried over. */}
      <CheckIn key={day} initialReadings={readings} day={day} initialStep={typeof step === 'string' ? step : null} />
    </PageShell>
  )
}
