import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@mistralai/mistralai"],
  experimental: {
    // OCR results for a multi-page PDF exceed the default action/body limits.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
