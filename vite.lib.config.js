import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      name: 'TesserarxPolkadot',
      fileName: 'tesserarx-polkadot',
      formats: ['iife']
    },
    outDir: 'public/dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        extend: true,
        globals: {}
      }
    }
  },
  define: {
    global: 'globalThis'
  }
});
