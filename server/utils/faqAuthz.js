/**
 * utils/faqAuthz.js — the ONE reusable FAQ ownership/permission check.
 *
 * THE POLICY (see README "FAQ ownership rules")
 *   admin                                     → allowed on ANY FAQ (override)
 *   creator + createdBy === user._id          → allowed (owns it)
 *   creator + createdBy !== user._id          → 403 Forbidden
 *   user / anonymous                          → never reaches here: the route
 *                                               already requires creator|admin
 *
 * WHY A SHARED HELPER: PATCH and DELETE enforce exactly the same rule — a
 * single implementation means they can never drift apart.
 */
import { ApiError } from './ApiError.js';

/**
 * @param {{_id: any, role: string}|undefined} user - req.user (DB-loaded)
 * @param {{createdBy: {_id: any}|null}} faq - the FAQ document being modified
 * @throws {ApiError} 403 when the user may not modify this FAQ
 */
export function assertCanModifyFaq(user, faq) {
  if (!user) throw ApiError.unauthorized(); // defense in depth; routes already guard

  if (user.role === 'admin') return; // admin bypasses ownership restrictions

  if (user.role === 'creator' && faq.createdBy && String(faq.createdBy) === String(user._id)) {
    return; // creators may modify ONLY their own FAQs
  }

  throw ApiError.forbidden('You can only modify FAQs you created.');
}
