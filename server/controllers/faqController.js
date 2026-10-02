/**
 * controllers/faqController.js — FAQ CRUD (the knowledge base).
 *
 * PERMISSIONS (ownership-aware — see README "FAQ ownership rules")
 * - GET (list & single): PUBLIC.
 * - POST: creator OR admin. createdBy is stamped with the author's id.
 * - PATCH / DELETE: admin (any FAQ) OR creator (only FAQs they created).
 *   The reusable check is utils/faqAuthz.assertCanModifyFaq().
 * - Plain 'user' role can never write here (route-level role guard).
 *
 * THE EMBEDDING LIFECYCLE (why search stays accurate)
 * - CREATE: embed "Q: ... A: ..." -> stored with the document.
 * - UPDATE: if question/answer changed -> re-embed -> embeddingUpdatedAt bumped.
 * - DELETE: the document (and its vector) is removed; the Atlas index reads
 *   the collection continuously, so nothing else needs cleaning.
 * The Atlas Vector Search index picks these changes up automatically.
 */
import mongoose from 'mongoose';
import { FAQ } from '../models/FAQ.js';
import { Category } from '../models/Category.js';
import { ok, created } from '../utils/responses.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { validateObjectId, validateFaqCreate, validateFaqUpdate } from '../validators/faqValidators.js';
import { embedDocument } from '../services/embeddingService.js';
import { searchFaqs } from '../services/searchService.js';
import { assertCanModifyFaq } from '../utils/faqAuthz.js';
import { env } from '../config/env.js';
import { validateQuestionText } from '../validators/faqValidators.js';

/** Confirms a category id exists and returns it; throws 400/404 otherwise. */
async function resolveCategory(categoryId) {
  validateObjectId(categoryId, 'category id');
  const category = await Category.findById(categoryId);
  if (!category) throw ApiError.badRequest('Category does not exist. Create it first.');
  return category;
}

/** GET /api/faqs?category=&page=&limit=&q= — public. Embeddings are excluded. */
export const listFaqs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Number.parseInt(req.query.limit ?? '20', 10) || 20);
  const filter = {};
  if (req.query.category) {
    validateObjectId(String(req.query.category), 'category id');
    filter.category = req.query.category;
  }
  if (req.query.q) filter.question = { $regex: String(req.query.q).slice(0, 100), $options: 'i' };

  const [items, total] = await Promise.all([
    FAQ.find(filter)
      .select('-embedding') // 768 floats per row would bloat every response
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    FAQ.countDocuments(filter),
  ]);

  return ok(res, { items, page, total, pages: Math.ceil(total / limit) });
});

/** GET /api/faqs/:id — public. */
export const getFaq = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'FAQ id');
  const faq = await FAQ.findById(req.params.id).select('-embedding').populate('category', 'name');
  if (!faq) throw ApiError.notFound('FAQ not found.');
  return ok(res, { faq });
});

/**
 * GET /api/faqs/search?q=...[&categoryId=] — PUBLIC. Reference-compatible
 * alias: a THIN wrapper that reuses the SAME searchFaqs() service as
 * POST /api/search (no duplicated logic; still Atlas Vector Search).
 * NOTE: here q is the natural-language query — the FAQ list endpoint's q
 * parameter is a keyword filter, and this route's query IS semantic.
 */
export const searchFaqsEndpoint = asyncHandler(async (req, res) => {
  const question = validateQuestionText(req.query.q);
  let categoryId = null;
  const raw = req.query.categoryId;
  if (raw !== undefined && raw !== null && raw !== '') {
    validateObjectId(String(raw), 'categoryId');
    categoryId = new mongoose.Types.ObjectId(String(raw));
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

/** POST /api/faqs — creator OR admin (route guard). Validates category, embeds, saves. */
export const createFaq = asyncHandler(async (req, res) => {
  const { question, answer, category } = validateFaqCreate(req.body);
  await resolveCategory(category);

  const embedding = await embedDocument(`Q: ${question}\nA: ${answer}`);
  const faq = await FAQ.create({
    question,
    answer,
    category,
    embedding,
    embeddingModel: env.geminiEmbeddingModel,
    embeddingUpdatedAt: new Date(),
    createdBy: req.user._id, // ownership stamp — creators may edit only these
  });
  return created(res, { faq: await faq.populate('category', 'name') });
});

/** PATCH /api/faqs/:id — admin (any FAQ) OR creator (own FAQ only). Re-embeds on content change. */
export const updateFaq = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'FAQ id');
  const update = validateFaqUpdate(req.body);
  if (update.category) await resolveCategory(update.category);

  const faq = await FAQ.findById(req.params.id);
  if (!faq) throw ApiError.notFound('FAQ not found.');

  // Ownership check AFTER fetch (needs createdBy): admin passes always,
  // creator only when createdBy matches → otherwise 403.
  assertCanModifyFaq(req.user, faq);

  const contentChanged =
    (update.question !== undefined && update.question !== faq.question) ||
    (update.answer !== undefined && update.answer !== faq.answer);

  if (update.question !== undefined) faq.question = update.question;
  if (update.answer !== undefined) faq.answer = update.answer;
  if (update.category !== undefined) faq.category = update.category;

  if (contentChanged) {
    faq.embedding = await embedDocument(`Q: ${faq.question}\nA: ${faq.answer}`);
    faq.embeddingModel = env.geminiEmbeddingModel;
    faq.embeddingUpdatedAt = new Date();
  }

  await faq.save(); // Mongoose validation runs here
  return ok(res, { faq: await faq.populate('category', 'name') });
});

/** DELETE /api/faqs/:id — admin (any FAQ) OR creator (own FAQ only). */
export const deleteFaq = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'FAQ id');
  const faq = await FAQ.findById(req.params.id);
  if (!faq) throw ApiError.notFound('FAQ not found.');

  // Same reusable ownership rule as PATCH (admin override, creator own-only).
  assertCanModifyFaq(req.user, faq);

  await faq.deleteOne();
  return ok(res, { message: 'FAQ deleted.' });
});
