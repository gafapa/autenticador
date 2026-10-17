import { defineConfig } from '@playwright/test'

const port = Number(process.env.DOCFORENSICS_E2E_PORT ?? 56073)
const deployedURL = process.env.DOCFORENSICS_BASE_URL
const baseURL = deployedURL ?? `http://127.0.0.1:${port}/`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: deployedURL ? undefined : {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
