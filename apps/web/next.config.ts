import type { NextConfig } from 'next';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
try {
  loadEnvFile(path.resolve(process.cwd(), '../../.env.local'));
} catch {
  /* optional */
}
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: path.resolve(process.cwd(), '../..') },
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
