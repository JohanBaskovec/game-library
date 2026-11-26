import { defineConfig } from '@playwright/test';

/** Phone sizes from CLAUDE.md: 320 × 568 is the minimum, the others are common phones. */
const PHONES = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
];

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    trace: 'off',
  },
  projects: PHONES.map(({ name, width, height }) => ({
    name,
    use: {
      browserName: 'chromium',
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
    },
  })),
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
