import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The container image is built with a self-contained server (see Dockerfile).
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
}

export default nextConfig
