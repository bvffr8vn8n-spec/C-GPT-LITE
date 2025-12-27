import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Убеждаемся, что bun:sqlite обрабатывается правильно на сервере
      config.externals = [...(config.externals || []), "bun:sqlite"];
    }
    return config;
  },
  // Добавляем пустую конфигурацию turbopack для совместимости с Next.js 16
  turbopack: {},
};

export default nextConfig;

