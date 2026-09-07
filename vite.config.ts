import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // REQUIRED by the platform — assets 404 and the page renders blank without it.
  base: '/gokwik/meta-credit-tower/',
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
