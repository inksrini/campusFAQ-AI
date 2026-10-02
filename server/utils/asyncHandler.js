/**
 * utils/asyncHandler.js — wraps async controller functions.
 *
 * WHY THIS EXISTS
 * Express (any version) does not catch rejected promises by default in older
 * majors; relying on version-specific auto-forwarding is fragile. This tiny
 * wrapper forwards any error/rejection to next(), which is exactly where the
 * central error handler picks it up. Every async controller is wrapped with
 * this, so no try/catch boilerplate is needed in controllers.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
