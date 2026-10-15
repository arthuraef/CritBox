import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.biomalabs.critbox',
  appName: 'CritBox',
  webDir: 'dist',
  backgroundColor: '#120e0b',
  server: {
    androidScheme: 'https',
  },
};

export default config;
