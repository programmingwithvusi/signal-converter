import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600, // Mediabunny's core chunk is ~540kB but lazy-loaded, not in the critical path
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) only accepts the function form
        manualChunks: (id) =>
          /node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id) ? 'vendor' : undefined,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setupTests.ts'],
  },
})