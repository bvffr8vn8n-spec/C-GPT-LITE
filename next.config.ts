import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Убеждаемся, что bun:sqlite обрабатывается правильно на сервере
      config.externals = [...(config.externals || []), "bun:sqlite"];
    }
    
    // FIX: Игнорируем pagefile.sys и другие системные файлы Windows
    // Создаём новый объект watchOptions, чтобы не изменять readonly свойства
    const existingIgnored = config.watchOptions?.ignored 
      ? (Array.isArray(config.watchOptions.ignored) 
          ? config.watchOptions.ignored 
          : [config.watchOptions.ignored])
      : [];
    
    // G) Фильтруем: только непустые строки, добавляем Windows системные файлы
    const ignoredPatterns = [
      ...existingIgnored,
      "**/pagefile.sys",
      "**/hiberfil.sys",
      "**/swapfile.sys",
      "C:\\\\pagefile.sys",
      "C:\\\\hiberfil.sys",
      "C:\\\\swapfile.sys",
      "**/node_modules/**",
      "**/.next/**",
    ].filter((pattern): pattern is string => typeof pattern === "string" && pattern.length > 0);
    
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ignoredPatterns,
    };
    
    return config;
  },
  // Добавляем пустую конфигурацию turbopack для совместимости с Next.js 16
  turbopack: {},
};

export default nextConfig;

