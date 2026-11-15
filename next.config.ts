import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: "standalone",
  // Data is fetched at request time from live sources with our own TTL cache
  // and offline snapshot fallback (src/lib/sources/cache.ts), so we keep the
  // classic rendering model instead of Cache Components.
  cacheComponents: false,
  poweredByHeader: false,
  // Phone pulse demo with `npm run dev`: the phone reaches the dev server via
  // the laptop's private LAN address (through scripts/pulse-https.mjs).
  // Dev only; production ignores it.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
