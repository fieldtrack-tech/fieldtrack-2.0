/** @type {import('next').NextConfig} */

// NEXT_PUBLIC_API_URL is the single source of truth for the backend API location.
//
// Valid values:
//   Full URL  → https://api.example.com
//               Browser calls the API directly; the /api/proxy rewrite is also
//               available for convenience or same-origin setups.
//   Path      → /api/proxy
//               Browser routes requests through Next.js's server-side proxy.
//               Used in CI placeholder builds or self-hosted setups.
//               Rewrite is skipped when the value is a relative path to prevent
//               an infinite routing loop (/api/proxy → /api/proxy → …).
const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const apiIsFullUrl = /^https?:\/\//.test(NEXT_PUBLIC_API_URL);

// Extract scheme+host only (strip any path) for use in CSP and rewrite destination.
// Empty string when the env var is a relative path — 'self' in CSP covers same-origin.
const apiOrigin = apiIsFullUrl ? new URL(NEXT_PUBLIC_API_URL).origin : "";

const nextConfig = {
  transpilePackages: ["mapbox-gl", "@fieldtrack/types"],
  images: {
    domains: [],
    // Mitigate GHSA-3x4c-7xq6-9pq8 (unbounded Next.js image disk cache growth).
    // Limit format variants and enforce TTL so stale image cache entries expire.
    // Full fix: upgrade to next@>=16.1.7 when breaking changes are reviewed.
    formats: ["image/webp"],
    minimumCacheTTL: 3600,
  },
  async headers() {
    const connectSources = [
      "'self'",
      "https://*.supabase.co",      // Supabase auth, realtime, storage
      "https://*.tiles.mapbox.com", // Mapbox raster / vector tiles
      "https://api.mapbox.com",     // Mapbox geocoding, directions, styles
      "https://events.mapbox.com",  // Mapbox telemetry
    ];
    // Only add the API origin when it is a full URL — same-origin requests
    // (/api/proxy path) are already covered by 'self' above.
    if (apiOrigin) {
      connectSources.push(apiOrigin);
    }

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              // blob: required for Mapbox GL sprite / image atlas
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              // Mapbox GL v3 spawns blob: Web Workers for tile decoding
              "worker-src blob:",
              "child-src blob:",
              `connect-src ${connectSources.join(" ")}`,
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Configure the server-side proxy only when NEXT_PUBLIC_API_URL is a full URL.
    // Skipping for relative paths avoids an infinite routing loop.
    if (!apiIsFullUrl) return [];
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
