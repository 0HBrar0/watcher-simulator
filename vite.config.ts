/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works at any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx}'], setupFiles: ['tests/setup.ts'] },
})
