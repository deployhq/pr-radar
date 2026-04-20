import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

const browser = process.env.BROWSER || 'chrome';

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      browser,
      manifest: 'manifest.json',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    __BROWSER__: JSON.stringify(browser),
  },
  build: {
    outDir: browser === 'firefox' ? 'dist-firefox' : 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
  },
});
