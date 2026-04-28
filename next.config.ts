import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@olympic/contracts", "@olympic/db", "@olympic/worker", "scraper-engine"],
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
