import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Прод-сборка кладёт в .next/standalone самодостаточный сервер вместе с
  // минимальным набором node_modules — из него собирается образ
  // (frontend/Dockerfile.prod). На `pnpm dev` не влияет.
  output: "standalone",
};

export default nextConfig;
