/**
 * controllers/chatController.js — POST /api/chat (public) — the full RAG flow.
 *
 * THE COMPLETE PIPELINE
 * 1. Validate + normalize the question.
 * 2. Embed it (Gemini embedding model).
 * 3. $vectorSearch -> top-k FAQs -> drop anything below the threshold.
 * 4a. Nothing survived? -> safe fallback line + log UnansweredQuestion.
 *     (Gemini is NEVER called with insufficient context — this is the
 *      deterministic anti-hallucination gate.)
 * 4b. Relevant FAQs found -> build numbered trusted context -> Gemini writes
 *     the answer from THAT context only.
 * 4c. Belt and suspenders: if Gemini STILL replies with the exact fallback
 *     sentence (its instruction says to, when the context is insufficient),
 *     we treat the question as unanswered too — same logging, same response
 *     shape, answeredByKnowledgeBase stays false.
 * 5. Respond with the answer + which FAQs were used (transparency) + topScore.
 *
 * optionalAuth ran before this controller: req.user exists only when the
 * request carried a valid JWT, so `askedBy` is attributed when possible.
 */
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateQuestionText } from '../validators/faqValidators.js';
import { searchFaqs } from '../services/searchService.js';
import { generateAnswer, FALLBACK_ANSWER } from '../services/geminiService.js';
import { UnansweredQuestion } from '../models/UnansweredQuestion.js';

export const chat = asyncHandler(async (req, res) => {
  const question = validateQuestionText(req.body?.question);

  // Steps 2-3: retrieval with the relevance threshold applied.
  const { matches, topScore } = await searchFaqs(question, { applyThreshold: true });

  if (matches.length === 0) {
    // Step 4a: do NOT invent anything. Log for admin review.
    await UnansweredQuestion.create({
      question: question.slice(0, 500),
      askedBy: req.user?._id ?? null,
      topScore: topScore ?? null,
    });
    return ok(res, {
      answer: FALLBACK_ANSWER,
      sources: [],
      answeredByKnowledgeBase: false,
      topScore,
    });
  }

  // Step 4b: grounded generation from trusted context only.
  const contexts = matches.map((m) => ({
    question: m.question,
    answer: m.answer,
    categoryName: m.categoryName,
  }));
  const answer = await generateAnswer(question, contexts);

  // Step 4c: the system instruction tells Gemini to reply with exactly this
  // sentence when the context lacks the answer. Honor it: do NOT report the
  // question as answered — log it and return the same safe fallback shape as
  // the threshold gate.
  if (answer === FALLBACK_ANSWER) {
    await UnansweredQuestion.create({
      question: question.slice(0, 500),
      askedBy: req.user?._id ?? null,
      topScore: topScore ?? null,
    });
    return ok(res, {
      answer: FALLBACK_ANSWER,
      sources: [],
      answeredByKnowledgeBase: false,
      topScore,
    });
  }

  return ok(res, {
    answer,
    sources: matches.map((m) => ({
      id: m._id,
      question: m.question,
      categoryName: m.categoryName,
      score: Number(m.score.toFixed(4)),
    })),
    answeredByKnowledgeBase: true,
    topScore,
  });
});
