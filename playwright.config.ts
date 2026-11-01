import { defineConfig, devices } from '@playwright/test'

const PORT = 5197
const SITE = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 1, // each page runs the whole universe on a software GPU
  use: {
    baseURL: SITE,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Same origin as the site, so the tests can answer for the service without CORS.
    command: `npx vite build --outDir .e2e-dist --mode e2e && npx vite preview --outDir .e2e-dist --strictPort --host 127.0.0.1 --port ${PORT}`,
    env: { VITE_UPLINK_URL: SITE },
    url: SITE,
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
