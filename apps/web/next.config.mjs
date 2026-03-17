/** @type {import('next').NextConfig} */

// Validate API origin - fail fast if invalid
function validateApiOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    throw new Error('API_DOMAIN must be a valid string');
  }
  
  // Must be a valid URL or relative path
  if (!origin.startsWith('http://') && !origin.startsWith('https://') && !origin.startsWith('/')) {
    throw new Error(`Invalid API_DOMAIN: ${origin}. Must start with http://, https://, or /`);
  }
  
  return origin;
}

const defaultApiOrigin = process.env.NODE_ENV === "development"
  ? "http://localhost:3000"
  : "https://api.fieldtrack.meowsician.tech";

const apiOrigin = process.env.API_DOMAIN
  ? (process.env.API_DOMAIN.startsWith("http://") || process.env.API_DOMAIN.startsWith("https://")
    ? validateApiOrigin(process.env.API_DOMAIN)
    : validateApiOrigin(`https://${process.env.API_DOMAIN}`))
  : defaultApiOrigin;

const nextConfig = {
  transpilePackages: ["mapbox-gl", "@fieldtrack/types"],
  images: {
    domains: [],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.fieldtrack.meowsician.tech https://*.supabase.co; frame-ancestors 'self';",
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Always expose a server-side proxy to avoid CORS issues on any deployment.
    // Set NEXT_PUBLIC_API_URL=/api/proxy in Vercel (or any non-localhost deploy)
    // so browser requests are same-origin and never trigger CORS preflight.
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
