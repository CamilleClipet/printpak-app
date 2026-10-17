import type { CapacitorConfig } from '@capacitor/cli';

const liveReloadUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'printpak.app',
  appName: 'Print Pak',
  webDir: 'dist',
  backgroundColor: '#9BBC0F',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#9BBC0F',
      launchAutoHide: false,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
      hidden: false,
    },
  },
  ...(liveReloadUrl ? { server: { url: liveReloadUrl, cleartext: true } } : {}),
};

export default config;
