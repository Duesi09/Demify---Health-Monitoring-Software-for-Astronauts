import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/inter'
import './globals.css'

export const metadata: Metadata = {
  title: 'Demify',
  description:
    'Health monitoring for astronauts on long-duration missions: gathers health indicators, compares them with your personal baseline and tells you what to do next.',
}

export const viewport: Viewport = { themeColor: '#000000' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
