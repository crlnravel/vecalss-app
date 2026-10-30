import createMDX from "@next/mdx";
import type { NextConfig } from "next";

/**
 * Site-wide Content-Security-Policy. Next.js injects inline bootstrap scripts,
 * so script-src keeps 'unsafe-inline' until a nonce pipeline exists; the rest
 * of the policy still blocks plugins, foreign frames, base-tag and form-action
 * hijacking.
 *
 * What each non-default source is for:
 * - frame-src: same-origin PDF previews plus the YouTube and Vimeo players
 *   the Materi video embeds point at.
 * - connect-src https: the PDF viewer fetches documents from signed storage
 *   URLs and media uploads PUT to signed storage URLs.
 * - worker-src blob: pdf.js runs its worker from a bundled same-origin file.
 */
function buildContentSecurityPolicy() {
  const isDevelopment = process.env.NODE_ENV !== "production";

  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    // React dev tooling needs eval; production builds never do.
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https:${isDevelopment ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  ].join("; ");
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },
  images: {
    remotePatterns: [
      {
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
        protocol: "https",
      },
    ],
  },
  // sharp resolves its native addon and libvips through optional platform
  // packages at runtime. Keep the Vercel Linux x64 files in server traces.
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/sharp/**/*",
      "node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/**/*",
      "node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
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
  async headers() {
    return [
      {
        headers: [
          { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
          // Browsers ignore HSTS over plain HTTP, so this is inert locally.
          // No includeSubDomains/preload: other subdomains may not be HTTPS yet.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // Legacy equivalent of frame-ancestors 'self' for older browsers.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // YouTube/Vimeo embeds refuse to play when no referrer is sent, so
          // cross-origin requests keep sending the origin (not the path).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
        source: "/:path*",
      },
      {
        // Listed after the site-wide rule so its stricter referrer policy wins
        // for the admin student preview.
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
        ],
        source: "/admin/student-preview/:path*",
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
