import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the seed CSVs into the API serverless functions so the runtime
  // auto-seeder can populate the DB on a fresh (serverless) instance.
  outputFileTracingIncludes: {
    "/api/**": ["./seed-data/**"],
  },
};

export default nextConfig;
