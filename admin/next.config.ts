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
    // The panel shows images with plain <img>, not next/image. A wildcard host here would turn /_next/image
    // into an open proxy that fetches any URL from this server, so only our own storage is allowed.
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
};

export default nextConfig;
