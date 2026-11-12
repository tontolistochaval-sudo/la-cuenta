import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lacuenta.app',
  appName: 'La Cuenta.',
  webDir: 'dist',
  backgroundColor: '#F1EADF',
  plugins: {
    // Fondo claro (lino): iconos oscuros en las barras del sistema. Los márgenes los pone el CSS (safe-area).
    SystemBars: { insetsHandling: 'css', style: 'LIGHT', initialViewportFitValueHint: 'cover' },
    LocalNotifications: { iconColor: '#E05A47' },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
