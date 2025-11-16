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
      formats: ['umd']
    },
    outDir: 'public/dist',
    emptyOutDir: false,
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  },
  define: {
    global: 'globalThis'
  }
});
