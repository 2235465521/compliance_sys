import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  /** 开发时把浏览器里的 /api 代理到后端，避免跨域（查重新后端文档默认 http://127.0.0.1:8000） */
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  },
  server: {
    // 开发环境：浏览器访问 /api → 转发到 Django（与 axios baseURL `/api` 一致）
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // 监控汇总等接口可能较慢；避免代理过早断开导致 socket hang up
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
})
