import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
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

const withMDX = createMDX({
  extension: /\.mdx$/,
  options: {
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(nextConfig);
