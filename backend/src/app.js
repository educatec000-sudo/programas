import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './lib/errors.js';
import { originCheck } from './middlewares/rateLimit.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('env', env.nodeEnv);
  app.set('maxUploadMb', env.maxUploadMb);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.isProd ? undefined : false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Chamadas server-to-server/cURL não enviam Origin. No navegador,
        // somente origens explicitamente configuradas recebem CORS.
        if (!origin || env.corsOrigins.includes(origin.replace(/\/$/, ''))) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cookieParser());
  app.use(compression());

  if (env.nodeEnv !== 'test') {
    app.use(
      morgan(env.isDev ? 'dev' : 'combined', {
        // Tokens de coleta são credenciais bearer e nunca devem aparecer nos logs de acesso.
        skip: (req) => (
          req.originalUrl.startsWith(`${env.apiPrefix}/public/pacto/`)
          || (req.originalUrl.includes('/notifications') && req.method === 'GET')
        ),
      }),
    );
  }

  app.get(`${env.apiPrefix}/health`, (_req, res) => {
    res.json({ status: 'ok', service: 'CPE-API', time: new Date().toISOString() });
  });

  app.use(originCheck);
  app.use(env.apiPrefix, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
