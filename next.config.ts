import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        destination: "/login",
        permanent: false,
        source: "/admin/login",
      },
      {
        destination: "/login",
        permanent: false,
        source: "/mentor/login",
      },
    ];
  },
};

export default nextConfig;
