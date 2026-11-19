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
