import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

/**
 * Oldest browsers the app must run on. The iOS app's web view is as old as the phone's Safari, so
 * newer syntax and CSS are translated down to this level at build time (P-15 in docs/DECISIONS.md).
 */
const BROWSER_TARGET = ['chrome100', 'safari15', 'firefox100'];

export default defineConfig({
  plugins: [svelte()],
  // Relative asset paths: the same build works on a website root, under a sub-path, and in Capacitor.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: BROWSER_TARGET,
    cssTarget: BROWSER_TARGET,
  },
  server: { host: true },
});
