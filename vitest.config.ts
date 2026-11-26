import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Plain TypeScript: shared packages and game logic. No DOM, on purpose.
        test: {
          name: 'logic',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'games/*/**/*.test.ts'],
        },
      },
      {
        // The Node.js host: plain Node, real sockets on a free port.
        test: {
          name: 'server',
          environment: 'node',
          include: ['apps/server-*/src/**/*.test.ts'],
          testTimeout: 15_000,
        },
      },
      'apps/client/vitest.config.ts',
    ],
  },
});
