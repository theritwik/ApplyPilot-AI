import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pino uses runtime require/worker-thread tricks that break when bundled.
  serverExternalPackages: ["pino", "pino-pretty"],
};

export default nextConfig;
