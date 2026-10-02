/**
 * controllers/adminController.js — admin workflow endpoints (all admin-only).
 *
 * THREE RESPONSIBILITIES
 * 1. generateFaqDrafts: Gemini proposes FAQ drafts from REQUIRED admin-supplied
 *    source info. Drafts are RETURNED, never saved — approval is a separate,
 *    explicit act (the admin posts them through POST /api/faqs after reviewing).
 * 2. Unanswered-question review: list / resolve / dismiss. "Convert to FAQ"
 *    pre-fills the FAQ form in the browser; the question is marked resolved
 *    only AFTER POST /api/faqs succeeds (see client/js/admin.js).
 * 3. stats: the three dashboard counts (one small aggregate).
 */
import { UnansweredQuestion } from '../models/UnansweredQuestion.js';
import { FAQ } from '../models/FAQ.js';
import { Category } from '../models/Category.js';
import { User } from '../models/User.js';
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { validateObjectId } from '../validators/faqValidators.js';
import { generateFaqDrafts } from '../services/geminiService.js';

/** POST /api/admin/generate-faq-drafts — admin only. Returns drafts; saves nothing. */
export const generateDrafts = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const count = Math.min(5, Math.max(1, Number.parseInt(body.count ?? '3', 10) || 3));

  if (topic.length < 3) throw ApiError.badRequest('Topic must be at least 3 characters.');
  // Source notes are REQUIRED — the AI must only draft from supplied facts.
  if (notes.length < 10) {
    throw ApiError.badRequest(
      'Source information is required (at least 10 characters). The AI drafts FAQs only from the facts you supply.',
      ['Provide source information (notes). The topic alone is not enough.']
    );
  }
  if (notes.length > 3000) throw ApiError.badRequest('Notes must be at most 3000 characters.');
  const categoryName = typeof body.categoryName === 'string' && body.categoryName.trim()
    ? body.categoryName.trim()
    : 'General';

  const drafts = await generateFaqDrafts({ categoryName, topic, notes, count });
  if (drafts.length === 0) throw new Error('Gemini returned no usable drafts. Please try again.');

  return ok(res, { drafts });
});

/** GET /api/admin/unanswered?status=open — admin only. */
export const listUnanswered = asyncHandler(async (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status)
    ? req.query.status
    : 'open';
  const items = await UnansweredQuestion.find({ status })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('askedBy', 'name email');
  return ok(res, { items });
});

/** PATCH /api/admin/unanswered/:id  { status: 'resolved' | 'dismissed' } — admin only. */
export const updateUnanswered = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, 'question id');
  const status = req.body?.status;
  if (!['open', 'resolved', 'dismissed'].includes(status)) {
    throw ApiError.badRequest('Status must be "open", "resolved" or "dismissed".');
  }
  const item = await UnansweredQuestion.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!item) throw ApiError.notFound('Question not found.');
  return ok(res, { item });
});

/** GET /api/admin/stats — admin only. Counts for the dashboard cards. */
export const stats = asyncHandler(async (_req, res) => {
  const [faqCount, categoryCount, userCount, openUnanswered] = await Promise.all([
    FAQ.countDocuments(),
    Category.countDocuments(),
    User.countDocuments(),
    UnansweredQuestion.countDocuments({ status: 'open' }),
  ]);
  return ok(res, { faqCount, categoryCount, userCount, openUnanswered });
});
