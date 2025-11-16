import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html'),
        library: resolve(__dirname, 'public/deck-library.html'),
        vault: resolve(__dirname, 'public/vault.html'),
        reader: resolve(__dirname, 'public/reader.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  optimizeDeps: {
    include: ['@polkadot/api', '@polkadot/api-contract', '@polkadot/extension-dapp', '@polkadot/util', '@polkadot/util-crypto']
  },
  define: {
    global: 'globalThis'
  }
});
