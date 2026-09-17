import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cargo Cuba por Chambatina',
    short_name: 'Cargo Cuba',
    description: 'Recogidas, rutas y seguimiento de conductores en tiempo real.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#f97316',
    orientation: 'portrait',
    lang: 'es',
    icons: [
      { src: '/logo-chambita-sm.png', sizes: '200x200', type: 'image/png' },
      { src: '/logo-chambita.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
