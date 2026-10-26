import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@departmental/shared-types"],
};

export default nextConfig;
