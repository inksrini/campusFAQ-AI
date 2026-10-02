/**
 * middleware/errorHandler.js — THE single place errors become JSON responses.
 *
 * THE FLOW
 * Any controller/middleware throws or rejects → asyncHandler forwards to
 * next(err) → Express jumps HERE (4 arguments = Express treats it as the
 * error handler) → we classify the error → one consistent JSON response.
 *
 * SECURITY RULE: responses contain only safe messages. Stack traces, config,
 * and credentials are logged to the server console ONLY, never sent out.
 */
import { ApiError } from '../utils/ApiError.js';

/** Friendly messages for MongoDB duplicate-key fields. */
const duplicateMessages = {
  email: 'An account with this email already exists.',
  name: 'This name is already in use.',
};

/** True when the failure came from the Gemini API (network, quota, key...). */
function isGeminiError(err) {
  return /gemini|generativelanguage|googleapis|api key/i.test(String(err?.message ?? ''));
}

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars — the 4th arg is how Express recognizes an error handler
export function errorHandler(err, _req, res, _next) {
  let status = err?.status ?? 500;
  let message = err?.message ?? 'Something went wrong';
  let errors = err?.errors;

  if (err instanceof ApiError) {
    // already shaped correctly
  } else if (err?.name === 'ValidationError') {
    // Mongoose schema validation failed
    status = 422;
    message = 'Validation failed';
    errors = Object.values(err.errors ?? {}).map((e) => ({ field: e.path, message: e.message }));
  } else if (err?.name === 'CastError') {
    // e.g. /api/faqs/not-a-valid-id
    status = 400;
    message = `Invalid value for "${err.path}".`;
    errors = undefined;
  } else if (err?.code === 11000) {
    // MongoDB unique index violation
    status = 409;
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    message = duplicateMessages[field] ?? `Duplicate value for "${field}". It must be unique.`;
    errors = undefined;
  } else if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
    status = 401;
    message = 'Session invalid or expired. Please log in again.';
  } else if (isGeminiError(err)) {
    status = 502;
    message = 'The AI service is temporarily unavailable. Please try again shortly.';
  }

  // Atlas Vector Search index missing / still building → tell the user it's temporary
  if (status === 500 && /planexecutor|index.*(not|doesn't).*(found|exist)|failed.*vector|no such index/i.test(String(err?.message ?? ''))) {
    status = 503;
    message = 'The semantic-search index is not ready yet. Please try again in a few minutes.';
  }

  if (status >= 500) {
    // Full detail stays on the server console only.
    console.error('[error]', status, err?.stack || err);
  }

  const body = { success: false, message };
  // Field-level details (from validators or Mongoose) accompany the message
  // for ANY status — e.g. 400 validation failures and 422 schema failures.
  if (Array.isArray(errors) && errors.length > 0) body.errors = errors;
  return res.status(status).json(body);
}
