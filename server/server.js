/**
 * server.js — the entry point. `npm start` runs this file.
 *
 * STARTUP SEQUENCE (each step fails fast with a clear message):
 * 1. env.js has already validated required variables at import time.
 * 2. Connect to MongoDB Atlas.
 * 3. Start listening on PORT.
 */
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { env } from './config/env.js';

async function main() {
  await connectDB();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] Campus AI running on http://localhost:${env.port}`);
    console.log(`[server] API base: http://localhost:${env.port}/api  (try GET /api/health)`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
