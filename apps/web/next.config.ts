import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sitenote/core", "@sitenote/ui"],
};

export default nextConfig;
