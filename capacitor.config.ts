import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.portascribe.mk1',
  appName: 'Portascribe',
  webDir: 'dist',
  backgroundColor: '#d9d7d0',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#d9d7d0' },
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
