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
    baseURL: `http://127.0.0.1:${PORT}`,
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
  // The tests run against the Node.js host: it serves the built website and the rooms, as in production.
  webServer: {
    command:
      'npm run build -w @game-library/client -w @game-library/server-node && npm run start -w @game-library/server-node',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      // Many tests make rooms from the same address: lift the limits that protect a real server.
      ROOMS_PER_ADDRESS_BURST: '100000',
      ROOMS_PER_ADDRESS_PER_MINUTE: '100000',
      SOCKETS_PER_ADDRESS: '100000',
      UNKNOWN_ROOMS_PER_ADDRESS_BURST: '100000',
    },
  },
});
