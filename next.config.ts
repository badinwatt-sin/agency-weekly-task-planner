import type { NextConfig } from "next";

// Content-Security-Policy is set per request (with a nonce) in middleware.ts.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "4.5mb" }, // matches the Vercel request limit; photos are shrunk in the browser first
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Never let browsers or proxies cache private pages or exports.
      { source: "/((?!_next/static|_next/image|favicon.ico).*)", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
