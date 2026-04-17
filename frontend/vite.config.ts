import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.10.218:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path) => {
          // 确保路径以 /api 开头，然后转发到后端的 /api/...
          return path;
        }
      },
      // WebSocket（Dify 解析结果推送）同源转发
      '/ws': {
        target: 'ws://192.168.10.218:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
      }
    }
  }
})
