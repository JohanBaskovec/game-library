import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Cannot change once the app is published (D-12).
  appId: 'fr.johanindustry.games',
  // Placeholder display name until the library is named (O-1).
  appName: 'Game Library',
  webDir: 'dist',
};

export default config;
