import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The container image is built with a self-contained server (see Dockerfile).
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Health data: never render inside another site, never guess content types,
          // and do not tell linked sites where the crew member came from.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
}

export default nextConfig
