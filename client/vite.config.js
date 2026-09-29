import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      /**
       * Dev proxies /api to the API server, so the browser only ever talks to one origin.
       *
       * That means no CORS round-trips locally, and — more importantly — the refresh cookie
       * is a first-party `SameSite=Strict` cookie in development exactly as it is in
       * production. A cross-origin dev setup can mask cookie problems that only appear once
       * you deploy.
       *
       * In production the client is built with an absolute VITE_API_URL and this never runs.
       */
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:4000',
          changeOrigin: false,
        },
      },
    },
    build: {
      sourcemap: true,
      // Routes are lazy-loaded per role, so keep the warning low enough to notice regressions.
      chunkSizeWarningLimit: 400,
    },
  };
});
