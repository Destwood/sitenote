import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sitenote/core", "@sitenote/ui", "@sitenote/widget"],
};

export default nextConfig;
