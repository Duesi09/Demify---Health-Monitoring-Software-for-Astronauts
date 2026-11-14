import { getMissionReadings } from '@/server/mission'
import { Dashboard } from '@/ui/Dashboard'
import { parseDay } from './day'

// Readings change whenever a crew member logs one, so never serve a cached page.
export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ day?: string | string[] }>
}) {
  const [{ day }, readings] = await Promise.all([searchParams, getMissionReadings()])
  return <Dashboard initialReadings={readings} initialDay={parseDay(day)} />
}
