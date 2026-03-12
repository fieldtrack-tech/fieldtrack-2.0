/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["mapbox-gl", "@fieldtrack/types"],
  images: {
    domains: [],
  },
};

export default nextConfig;
