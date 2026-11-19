import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes do monorepo são TypeScript puro e precisam ser compilados pelo Next.
  transpilePackages: ["@revenda/regras", "@revenda/catalogo"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
