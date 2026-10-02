/**
 * services/searchService.js — semantic search over FAQs (Atlas Vector Search).
 *
 * HOW SEMANTIC SEARCH WORKS HERE (the pipeline)
 * 1. The user's question is embedded into a vector (see embeddingService).
 * 2. $vectorSearch compares that vector against every FAQ's stored vector
 *    using COSINE similarity and returns the closest `topK` documents.
 * 3. Each result carries `score` ($meta: vectorSearchScore). With these
 *    models, paraphrases of a stored question typically score ~0.65-0.9;
 *    unrelated questions land much lower (~0.2-0.45).
 * 4. Results below env.similarityThreshold are DROPPED. If none survive, the
 *    caller returns the safe fallback and logs an UnansweredQuestion.
 *
 * This is the anti-hallucination gate: Gemini is never called without
 * sufficiently relevant context. The threshold lives in .env so it can be
 * tuned (scripts/testSearch.js prints real scores to help pick it).
 */
import { FAQ } from '../models/FAQ.js';
import { embedQuery } from './embeddingService.js';
import { env } from '../config/env.js';

/** Name of the Atlas Vector Search index (created manually in the Atlas UI). */
export const VECTOR_INDEX_NAME = 'faq_vector_index';

/**
 * Find the most relevant FAQs for a question.
 * @param {string} question - the raw question text
 * @param {{categoryId?: import('mongoose').Types.ObjectId|null, applyThreshold?: boolean}} [opts]
 *   categoryId must already be a ObjectId (convert with
 *   `new mongoose.Types.ObjectId(id)` in the controller — the FAQ documents
 *   store `category` as ObjectId, so a raw string would never match).
 * @returns {Promise<{matches: Array, topScore: number|null}>}
 */
export async function searchFaqs(question, { categoryId = null, applyThreshold = true } = {}) {
  // 1) embed the question (one Gemini call per search — fast and cheap)
  const queryVector = await embedQuery(question);

  const vectorStage = {
    index: VECTOR_INDEX_NAME,
    path: 'embedding', // the FAQ field that holds the vector
    queryVector,
    // scan ~25x more documents than we keep — good recall, still fast
    numCandidates: Math.max(100, env.searchTopK * 25),
    limit: env.searchTopK,
  };
  // Optional pre-filter (uses the "category" filter field in the index)
  if (categoryId) vectorStage.filter = { category: { $eq: categoryId } };

  const pipeline = [
    { $vectorSearch: vectorStage },
    { $addFields: { score: { $meta: 'vectorSearchScore' } } },
    ...(applyThreshold ? [{ $match: { score: { $gte: env.similarityThreshold } } }] : []),
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'categoryDoc' } },
    {
      $project: {
        question: 1,
        answer: 1,
        category: 1,
        score: 1,
        categoryName: { $ifNull: [{ $first: '$categoryDoc.name' }, 'General'] },
      },
    },
  ];

  const matches = await FAQ.aggregate(pipeline);
  return { matches, topScore: matches.length > 0 ? matches[0].score : null };
}
