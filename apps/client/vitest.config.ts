import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: 'client',
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
    },
  }),
);
