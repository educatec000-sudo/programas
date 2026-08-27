import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// O frontend chama a API por caminho relativo (/api). Em desenvolvimento o
// Vite encaminha para o backend, mantendo os cookies httpOnly na mesma origem.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      // localhost é mais seguro para trabalho local no VS Code. Use
      // VITE_DEV_HOST=0.0.0.0 apenas quando realmente precisar expor na LAN.
      host: env.VITE_DEV_HOST || 'localhost',
      port: Number(env.VITE_DEV_PORT) || 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY || 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
