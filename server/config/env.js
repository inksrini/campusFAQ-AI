/**
 * config/env.js — loads and validates environment variables.
 *
 * WHY THIS FILE EXISTS
 * Secrets (DB password, JWT secret, Gemini key) must never live in code.
 * They live in a `.env` file that is git-ignored. This module loads it ONCE
 * (dotenv), then checks that every required variable is present BEFORE the
 * app tries to use it. A forgotten variable therefore fails immediately with
 * a clear message instead of a cryptic crash deep inside a request.
 */
import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY'];

const missing = required.filter((name) => !process.env[name] || process.env[name].startsWith('replace-with'));
if (missing.length > 0) {
  console.error(
    `\n[FATAL] Missing environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in real values, then restart the server.\n'
  );
  process.exit(1);
}

function int(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}
function float(name, fallback) {
  const value = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(value) ? value : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: int('PORT', 3000),

  mongoUri: process.env.MONGODB_URI,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',

  geminiApiKey: process.env.GEMINI_API_KEY,
  // Model names live ONLY here — a deprecation is a config change, not a code change.
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite',
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
  embeddingDimensions: int('EMBEDDING_DIMENSIONS', 768),

  similarityThreshold: float('SIMILARITY_THRESHOLD', 0.5),
  searchTopK: int('SEARCH_TOP_K', 4),

  bcryptSaltRounds: int('BCRYPT_SALT_ROUNDS', 10),
};

export const isDev = env.nodeEnv !== 'production';
