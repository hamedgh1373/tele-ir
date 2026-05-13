import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  outputFileTracingRoot: __dirname,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/assets/static/:path*",
          destination: "/_next/static/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
