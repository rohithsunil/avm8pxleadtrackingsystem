import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// .env.local is written by `neon deploy`; .env holds PINs and other local values.
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

// In `npm run dev`, serve /api/* from the same handler Netlify runs,
// so local development needs no Netlify CLI.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        try {
          const { handle } = await server.ssrLoadModule('/server/router.js');
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });
          const response = await handle(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
