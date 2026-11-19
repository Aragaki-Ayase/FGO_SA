import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const mooncellProxy = {
  '/mooncell-api': {
    target: 'https://fgo.wiki',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/mooncell-api/, '/api.php'),
    headers: {
      'User-Agent': 'MooncellOfflineApp/1.0 (local catalog sync)',
      Referer: 'https://fgo.wiki/',
    },
  },
  '/mooncell-media': {
    target: 'https://media.fgo.wiki',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/mooncell-media/, ''),
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://fgo.wiki/',
    },
  },
  '/atlas-api': {
    target: 'https://api.atlasacademy.io',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/atlas-api/, ''),
    headers: {
      'User-Agent': 'Mozilla/5.0 MooncellOfflineApp/1.0',
    },
  },
  '/atlas-static': {
    target: 'https://static.atlasacademy.io',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/atlas-static/, ''),
    headers: {
      'User-Agent': 'Mozilla/5.0 MooncellOfflineApp/1.0',
    },
  },
};

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'bundle',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
    proxy: mooncellProxy,
  },
  preview: {
    port: 4173,
    host: true,
    proxy: mooncellProxy,
  },
});
