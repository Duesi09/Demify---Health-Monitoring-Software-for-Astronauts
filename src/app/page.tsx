import { MISSION_DAYS } from '@/domain/simulator'
import { getMissionReadings } from '@/server/mission'
import { Dashboard } from '@/ui/Dashboard'

// Readings change whenever a crew member logs one, so never serve a cached page.
export const dynamic = 'force-dynamic'

const DEFAULT_DAY = 42

function parseDay(value: string | string[] | undefined): number {
  const day = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(day) && day >= 1 && day <= MISSION_DAYS ? day : DEFAULT_DAY
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ day?: string | string[] }>
}) {
  const [{ day }, readings] = await Promise.all([searchParams, getMissionReadings()])
  return <Dashboard initialReadings={readings} initialDay={parseDay(day)} />
}
