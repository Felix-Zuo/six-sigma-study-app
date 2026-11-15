import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.findjob.sixsigmastudy',
  appName: '飞阅',
  webDir: 'apps/reader/dist',
  loggingBehavior: 'none',
  plugins: { NativeAppUpdater: { trustedOrigins: ['https://fly-view-personal.vercel.app'] } }
};

export default config;
