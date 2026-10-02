/**
 * config/db.js — MongoDB connection via Mongoose.
 *
 * WHY MONGOOSE
 * Mongoose is an ODM (Object-Document Mapper): you define schemas (data rules)
 * in JavaScript and get models like `User`, `FAQ` with helpful methods
 * (create, findOne, update...) instead of raw driver calls. It also runs
 * schema validation before anything is written to MongoDB.
 *
 * CONNECTION STRATEGY
 * One connection, opened once at startup by server.js. Mongoose keeps the
 * connection alive and reconnects automatically; we just log the outcome.
 */
import mongoose from 'mongoose';
import { env } from './env.js';

// strictQuery: true makes Mongoose STRIP query-filter fields that are not in
// the schema (e.g. a typo like find({ titel: 'x' }) on a schema with `title`).
// Without it, unknown fields pass through to MongoDB and silently match nothing,
// which can be very hard to debug. (It does NOT throw an error — it strips.)
mongoose.set('strictQuery', true);
// Serialize the `id` virtual on every JSON response (alongside _id) so the
// frontend can always use doc.id consistently across all collections.
mongoose.set('toJSON', { virtuals: true });

export async function connectDB({ exitOnFail = true } = {}) {
  try {
    await mongoose.connect(env.mongoUri);
    console.log(`[db] Connected to MongoDB Atlas (database: ${mongoose.connection.name})`);
  } catch (err) {
    console.error('[db] MongoDB connection FAILED:', err.message);
    if (exitOnFail) process.exit(1); // no database = nothing works; stop immediately
    throw err; // scripts (like the smoke test) may want to continue without a DB
  }

  mongoose.connection.on('error', (err) => console.error('[db] runtime error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected from MongoDB'));
}
