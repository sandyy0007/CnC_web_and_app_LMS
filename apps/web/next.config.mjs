
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: false },

  images: {
    // Allow next/image to load book covers and other externally-hosted media.
    // Using remotePatterns (preferred over deprecated `domains`) for precise control.
    remotePatterns: [
      {
        // QR code generation service used in the UPI payments page
        protocol: 'https',
        hostname: 'api.qrserver.com',
        pathname: '/v1/create-qr-code/**',
      },
      {
        // Generic HTTPS fallback for book cover images hosted anywhere (S3, CDN, etc.)
        // Restrict to https only to prevent loading insecure assets.
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  webpack(config) {
    config.resolve.modules = [
      ...(config.resolve.modules || ['node_modules']),
      path.join(__dirname, 'node_modules'),
    ];
    return config;
  },

  async rewrites() {
    const target =
      process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

    return [
      {
        source: '/api/v1/:path*',
        destination: `${target}/api/v1/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
