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
      'apps/client/vitest.config.ts',
    ],
  },
});
