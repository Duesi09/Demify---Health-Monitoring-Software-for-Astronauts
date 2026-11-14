import type { Metadata } from 'next'
import { parseDay } from '@/app/day'
import { parseProfile } from '@/domain/missionContext'
import { getMissionReadings } from '@/server/mission'
import { EarthLink } from '@/ui/link/EarthLink'

export const metadata: Metadata = { title: 'Earth link | Demify' }

// Readings change whenever a crew member logs one, so never serve a cached page.
export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ day?: string | string[]; profile?: string | string[] }>
}) {
  const [{ day, profile }, readings] = await Promise.all([searchParams, getMissionReadings()])
  return <EarthLink initialReadings={readings} initialDay={parseDay(day)} initialProfile={parseProfile(profile)} profileGiven={profile !== undefined} />
}
