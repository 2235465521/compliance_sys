import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  /** 开发时把浏览器里的 /api 代理到后端，避免跨域（查新后端文档默认 http://127.0.0.1:8000） */
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
      /** 5173 被占用时不自动改 5174，避免书签/习惯端口错位 */
      strictPort: true,
      // 开发环境：浏览器访问 /api → 转发到 Django（与 axios baseURL `/api` 一致）
      proxy: {
        "/api": {
          target: devProxyTarget,
          changeOrigin: true,
          timeout: 120_000,
        },
      },
    },
  };
});
