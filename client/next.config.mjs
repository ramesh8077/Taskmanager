/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendApiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://taskmanager-production-4b08.up.railway.app/api';

    return [
      {
        source: '/api/:path*',
        destination: `${backendApiUrl}/:path*`
      }
    ]
  }
};

module.exports = nextConfig;