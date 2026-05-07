/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

    return [
      {
        source: '/api/:path*',
        destination: `${backendApiUrl}/:path*`
      }
    ]
  }
};

export default nextConfig;
