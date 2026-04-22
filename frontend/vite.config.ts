import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  /** 开发时把浏览器里的 /api 代理到局域网后端，避免跨域；端口按后端实际修改 */
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://192.168.10.218:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
