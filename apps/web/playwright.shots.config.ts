import { defineConfig, devices } from '@playwright/test';

/** Regenerates the README screenshots: pnpm --filter @fresnel/web shots */
export default defineConfig({
  testDir: './shots',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } }],
  webServer: { command: 'pnpm vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true },
});
