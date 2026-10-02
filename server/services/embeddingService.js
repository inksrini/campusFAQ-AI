/**
 * services/embeddingService.js — turns text into vectors (embeddings).
 *
 * WHAT AN EMBEDDING IS
 * An embedding is a list of numbers (a "vector") produced by an AI model that
 * represents the MEANING of a piece of text. Texts with similar meanings get
 * similar numbers even when they share no words. That is what lets us match
 * "Can I use the library at 5 in the evening?" with "What are the library
 * working hours?" — keyword search cannot do that.
 *
 * WHERE IT'S USED
 * - FAQ documents: embedded at create/update/seed time (RETRIEVAL_DOCUMENT)
 * - User questions: embedded per request (RETRIEVAL_QUERY)
 * Vectors are stored on the FAQ document in MongoDB and searched with
 * MongoDB Atlas Vector Search ($vectorSearch) — no external vector database.
 *
 * MODEL + DIMENSIONS come from environment variables (.env), so a future
 * model change is a config change, not a code change.
 */
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

/**
 * Generate one embedding vector for the given text.
 * @param {string} text - the text to embed
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType - docs and queries use
 *        different task types; mixing them slightly degrades retrieval quality.
 * @returns {Promise<number[]>} vector of length env.embeddingDimensions
 */
export async function embedText(text, taskType) {
  const response = await ai.models.embedContent({
    model: env.geminiEmbeddingModel,
    contents: text,
    config: {
      taskType,
      outputDimensionality: env.embeddingDimensions,
    },
  });

  const values = response?.embeddings?.[0]?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Gemini returned an empty embedding.');
  }
  return values;
}

/** For stored FAQ text (the things we search over). */
export const embedDocument = (text) => embedText(text, 'RETRIEVAL_DOCUMENT');

/** For user questions (the thing we search with). */
export const embedQuery = (text) => embedText(text, 'RETRIEVAL_QUERY');
