import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.foolscap.app',
  appName: 'Foolscap',
  webDir: 'dist',
  backgroundColor: '#f6eaa7',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never', scrollEnabled: false, backgroundColor: '#f6eaa7' },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#f6eaa7' },
    SystemBars: { insetsHandling: 'css' },
    // iPhone: the keyboard shrinks the web view (like Android's adjustResize) so the machine keeps its shape
    Keyboard: { resize: 'native' as any },
  },
};

export default config;
