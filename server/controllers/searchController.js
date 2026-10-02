/**
 * controllers/searchController.js — POST /api/search (public).
 *
 * PURPOSE: semantic search WITHOUT answer generation. This endpoint exists so
 * the retrieval half of the system can be tested independently (a Phase 1
 * requirement): it returns the raw matched FAQs and their similarity scores.
 * No Gemini answer call happens here — only the question embedding.
 */
import mongoose from 'mongoose';
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateQuestionText, validateObjectId } from '../validators/faqValidators.js';
import { searchFaqs } from '../services/searchService.js';
import { env } from '../config/env.js';

export const search = asyncHandler(async (req, res) => {
  const question = validateQuestionText(req.body?.question);

  // Optional category filter: validate the shape AND convert to a real
  // ObjectId before it reaches the $vectorSearch filter — the FAQ documents
  // store `category` as ObjectId, so a raw string would silently match nothing.
  let categoryId = null;
  const rawCategoryId = req.body?.categoryId;
  if (rawCategoryId !== undefined && rawCategoryId !== null && rawCategoryId !== '') {
    validateObjectId(String(rawCategoryId), 'categoryId'); // throws a clean 400
    categoryId = new mongoose.Types.ObjectId(String(rawCategoryId));
  }

  const { matches, topScore } = await searchFaqs(question, { categoryId, applyThreshold: true });

  return ok(res, {
    query: question,
    threshold: env.similarityThreshold,
    topScore,
    matches: matches.map((m) => ({
      id: m._id,
      question: m.question,
      answer: m.answer,
      category: m.category,
      categoryName: m.categoryName,
      score: Number(m.score.toFixed(4)),
    })),
  });
});
