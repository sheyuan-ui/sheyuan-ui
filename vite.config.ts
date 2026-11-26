import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: false,
    // 管理服务默认监听 127.0.0.1:8080；同源请求由这里转发，避免开发时跨域
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8080', ws: true },
    },
    watch: {
      // Windows 下被占用的临时/构建产物会让 watcher 抛 EBUSY 并把 dev server 带走
      ignored: [
        '**/*.tmp',
        '**/~$*',
        '**/.tmp_verify/**',
        '**/release/**',
        '**/dist/**',
      ],
    },
  },
})
