import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve images directly from assets. Cloudflare Image transformations are
  // not enabled on the account, so the /_vinext/image optimizer (env.IMAGES)
  // would throw. The IMAGES binding stays wired; flip this off once
  // Cloudflare Image Transformations are enabled to re-enable optimization.
  images: { unoptimized: true },
};

export default nextConfig;
