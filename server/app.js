/**
 * app.js — builds the Express application.
 *
 * ORDER MATTERS:
 * 1. express.json  → parses JSON request bodies (otherwise req.body is undefined)
 * 2. (optional) cors → only needed if you serve the client separately (Live Server)
 * 3. static client → serves the client/ folder so ONE port runs the whole app
 * 4. /api routes   → all business endpoints
 * 5. 404 handler   → anything unmatched becomes a clean JSON 404
 * 6. error handler → LAST: catches everything thrown above it
 */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isDev } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Only needed when the frontend is served from a DIFFERENT origin
  // (e.g. VS Code Live Server on :5500). Harmless otherwise.
  app.use('/api', cors({ origin: isDev ? true : false }));

  // Serve the vanilla-JS frontend from the same server (no CORS needed).
  const clientDir = path.join(__dirname, '..', 'client');
  app.use(express.static(clientDir));

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
