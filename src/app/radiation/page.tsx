import type { Metadata } from 'next'
import { getMissionReadings } from '@/server/mission'
import { RadiationView } from '@/ui/radiation/RadiationView'
import { parseDay } from '../day'

export const metadata: Metadata = { title: 'Radiation | Demify' }

// Readings change whenever a crew member logs one, so never serve a cached page.
export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ day?: string | string[] }>
}) {
  const [{ day }, readings] = await Promise.all([searchParams, getMissionReadings()])
  // The page only needs the dose readings; the rest of the log stays on the server.
  const doses = readings.filter((r) => r.metric === 'radiationDose')
  return <RadiationView readings={doses} initialDay={parseDay(day)} />
}
