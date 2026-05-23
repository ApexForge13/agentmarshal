import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/access/v1/evaluation',
        destination: '/api/access/v1/evaluation',
      },
    ];
  },
};

export default nextConfig;
