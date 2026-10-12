import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "remotion",
    "esbuild",
    "ffmpeg-static",
  ],
};

export default nextConfig;
