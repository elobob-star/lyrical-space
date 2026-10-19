import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.foolscap.app',
  appName: 'Foolscap',
  webDir: 'dist',
  backgroundColor: '#f6eaa7',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#f6eaa7' },
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
