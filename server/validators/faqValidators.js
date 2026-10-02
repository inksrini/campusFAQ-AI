/**
 * validators/faqValidators.js — request-body checks for FAQ + chat/search.
 *
 * The FAQ category is validated in the CONTROLLER (it needs a DB lookup to
 * confirm the ObjectId exists — validation here can only check shape).
 */
import { ApiError } from '../utils/ApiError.js';

const EMAILISH = /^\S+@\S+\.\S+/;

/** Shared rules for a user's question (used by /api/search and /api/chat too). */
export function validateQuestionText(raw) {
  const question = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (question.length < 5 || question.length > 500) {
    throw ApiError.badRequest('Question must be between 5 and 500 characters.');
  }
  if (EMAILISH.test(question)) throw ApiError.badRequest('This does not look like a question.');
  return question;
}

export function validateFaqCreate(body) {
  const errors = [];
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';

  if (question.length < 5 || question.length > 500) errors.push('Question must be 5-500 characters.');
  if (answer.length < 10 || answer.length > 5000) errors.push('Answer must be 10-5000 characters.');
  if (!category) errors.push('Category is required.');

  if (errors.length > 0) throw ApiError.badRequest('FAQ failed validation.', errors);
  return { question, answer, category };
}

export function validateFaqUpdate(body) {
  const errors = [];
  const update = {};

  if (body.question !== undefined) {
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (question.length < 5 || question.length > 500) errors.push('Question must be 5-500 characters.');
    else update.question = question;
  }
  if (body.answer !== undefined) {
    const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
    if (answer.length < 10 || answer.length > 5000) errors.push('Answer must be 10-5000 characters.');
    else update.answer = answer;
  }
  if (body.category !== undefined) {
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (!category) errors.push('Category must be a non-empty id.');
    else update.category = category;
  }

  if (errors.length > 0) throw ApiError.badRequest('Update failed validation.', errors);
  if (Object.keys(update).length === 0) throw ApiError.badRequest('Nothing to update. Provide "question", "answer" and/or "category".');
  return update;
}

export function validateObjectId(id, label = 'id') {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
    throw ApiError.badRequest(`Invalid ${label}.`);
  }
  return id;
}
