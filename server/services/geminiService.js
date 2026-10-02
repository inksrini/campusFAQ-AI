/**
 * services/geminiService.js — answer generation + FAQ draft generation.
 *
 * THE GOLDEN RULE OF THIS APP
 * The MongoDB knowledge base is the source of truth. Gemini is only a WRITER:
 * it composes a readable answer FROM the trusted context we retrieved. It must
 * never invent college facts. Two mechanisms enforce this:
 *   1. We only call Gemini when semantic search found relevant FAQs.
 *   2. The system instruction below forbids using outside knowledge.
 *
 * RELIABILITY
 * Both generation calls go through a small bounded retry: busy Flash models
 * sometimes answer with a transient 503 UNAVAILABLE ("high demand"), which
 * usually clears within seconds. We retry ONLY those (max 3 total attempts,
 * ~2s then ~4s backoff with jitter); permanent errors (400/401/403/404,
 * safety blocks, invalid prompts) fail immediately. After the retries are
 * exhausted the original error propagates and the central error handler
 * keeps mapping it to 502/503 JSON as before.
 */
import { ApiError as GeminiApiError, GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

/** Total generation attempts (1 real try + up to 2 retries). */
const RETRY_MAX_ATTEMPTS = 3;
/** Base delay for the exponential backoff: ~2s, then ~4s. */
const RETRY_BASE_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Only HTTP 5xx from the Gemini API are transient (e.g. 503 UNAVAILABLE). */
function isTransientGeminiError(err) {
  return (
    err instanceof GeminiApiError &&
    typeof err.status === 'number' &&
    err.status >= 500
  );
}

/** Exponential backoff with jitter: attempt 1 → ~2s, attempt 2 → ~4s (±25%). */
function backoffDelayMs(attempt) {
  const base = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/**
 * ai.models.generateContent with bounded exponential-backoff retry.
 * 5xx errors are retried (max RETRY_MAX_ATTEMPTS total); everything else —
 * 400/401/403/404, safety blocks, validation errors — is rethrown at once.
 * The error object itself is never altered, so the error handler's 502/503
 * mapping behaves exactly as before.
 */
async function generateContentWithRetry(request) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await ai.models.generateContent(request);
    } catch (err) {
      if (attempt >= RETRY_MAX_ATTEMPTS || !isTransientGeminiError(err)) {
        throw err;
      }
      const delayMs = backoffDelayMs(attempt);
      console.warn(
        `[gemini] attempt ${attempt}/${RETRY_MAX_ATTEMPTS} failed with ${err.status} — retrying in ${delayMs}ms`
      );
      await sleep(delayMs);
    }
  }
}

/** The exact safe-fallback sentence users see when we have no reliable info. */
export const FALLBACK_ANSWER =
  "I couldn't find reliable information about that in the college FAQ knowledge base.";

const SYSTEM_INSTRUCTION = `You are Campus AI, the official FAQ assistant of a college.
You answer student questions using ONLY the numbered trusted context provided with each question.
Rules:
- Use only facts stated in the trusted context. Never invent, guess, or use outside knowledge.
- If the trusted context does not contain the answer, reply exactly: "${FALLBACK_ANSWER}"
- Be concise (2-4 sentences), friendly and helpful.
- Do not mention "context", "documents" or "numbered snippets"; just answer naturally.`;

/**
 * Generate a grounded answer from retrieved FAQ context.
 * @param {string} question - the student's question
 * @param {{question: string, answer: string, categoryName: string}[]} contexts
 * @returns {Promise<string>} the generated answer text
 */
export async function generateAnswer(question, contexts) {
  const contextBlock = contexts
    .map((c, i) => `[${i + 1}] (category: ${c.categoryName})\nQ: ${c.question}\nA: ${c.answer}`)
    .join('\n\n');

  const response = await generateContentWithRetry({
    model: env.geminiModel,
    contents: `Trusted context:\n${contextBlock}\n\nStudent question: ${question}`,
    config: {
      // Current Gemini models reject legacy sampling params (temperature/
      // top_p/top_k/candidate_count) with 400 — send ONLY what the API
      // supports. Factual consistency comes from the strict grounding
      // instruction below.
      systemInstruction: SYSTEM_INSTRUCTION,
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error('Gemini returned an empty answer.');
  return text;
}

/**
 * Generate FAQ DRAFTS for admin review. Drafts are NEVER saved automatically —
 * the admin reviews, edits, and explicitly saves the ones they approve.
 *
 * GROUNDING RULE: `notes` (source information) is REQUIRED. The topic only
 * describes WHAT to write about — it is never used as a substitute for facts.
 * @param {{categoryName: string, topic: string, notes: string, count: number}} input
 * @returns {Promise<{question: string, answer: string}[]>}
 */
export async function generateFaqDrafts({ categoryName, topic, notes, count }) {
  const response = await generateContentWithRetry({
    model: env.geminiModel,
    contents: `Generate ${count} college FAQ entries.
Category: ${categoryName}
Topic: ${topic}

Source information — the ONLY facts you may use:
${notes}

Return ONLY valid JSON (no markdown fences) shaped like:
{"drafts":[{"question":"...","answer":"..."}]}`,
    config: {
      systemInstruction:
        'You draft FAQs for a college website using ONLY the supplied source information. ' +
        'The topic only indicates the subject; every factual claim must come from the source information. ' +
        'If the source information is insufficient for a useful FAQ, skip it instead of inventing content. ' +
        'Answers must be concise and factual. Output valid JSON only.',
    },
  });

  const text = response.text?.trim() ?? '';
  // Models sometimes wrap JSON in ``` fences even when told not to — strip them.
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Gemini returned drafts in an unexpected format. Please try again.');
  }

  // Keep only drafts that can actually pass FAQ validation. The answer limit
  // mirrors the FAQ schema maximum (5000), not an arbitrary smaller number —
  // valid longer answers must not be silently discarded.
  return (Array.isArray(parsed.drafts) ? parsed.drafts : [])
    .filter((d) => d && typeof d.question === 'string' && typeof d.answer === 'string')
    .map((d) => ({ question: d.question.trim(), answer: d.answer.trim() }))
    .filter((d) => d.question.length >= 5 && d.question.length <= 500)
    .filter((d) => d.answer.length >= 10 && d.answer.length <= 5000)
    .slice(0, count);
}
