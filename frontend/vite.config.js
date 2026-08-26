import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O frontend chama a API por caminho relativo (/api) — o dev server
// faz o proxy para o backend, mantendo cookies httpOnly na mesma origem.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true, // aceita o host do preview público
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
