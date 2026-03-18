import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      stream: 'stream-browserify',
      crypto: 'crypto-browserify',
      events: 'events',
      util: 'util',
    },
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          solana: ['@solana/web3.js'],
        },
      },
    },
  },
});
