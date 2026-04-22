import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

const browser = process.env.BROWSER || 'chrome';
// Edge is Chromium-based and uses the same manifest fields as Chrome
const manifestBrowser = browser === 'edge' ? 'chrome' : browser;

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      browser: manifestBrowser,
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
    outDir: browser === 'firefox' ? 'dist-firefox' : browser === 'edge' ? 'dist-edge' : 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
  },
});
