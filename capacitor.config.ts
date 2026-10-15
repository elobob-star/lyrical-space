import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.portascribe.mk1',
  appName: 'Portascribe',
  webDir: 'dist',
  backgroundColor: '#16171a',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#16171a' },
  },
};

export default config;
