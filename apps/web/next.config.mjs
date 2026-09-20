/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: false },
  async rewrites() {
    // The browser calls /api/v1/* on its own origin; Next proxies to the FastAPI service so
    // the HttpOnly refresh cookie is first-party and no CORS pre-flight is needed.
    const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';
    return [{ source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
export default nextConfig;
