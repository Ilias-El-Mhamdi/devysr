import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      shared: path.resolve(import.meta.dirname, '../shared'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
