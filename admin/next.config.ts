import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads the user's session from cookies, so the whole panel is rendered on request.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }, { protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
