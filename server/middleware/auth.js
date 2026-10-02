/**
 * middleware/auth.js — WHO are you? (authentication) and ARE YOU ALLOWED? (authorization)
 *
 * HOW JWT AUTH WORKS HERE
 * 1. Login returns a token: three base64 parts — header.payload.signature.
 *    The payload contains { sub: userId, role } and an expiry. The signature
 *    is created with JWT_SECRET; without the secret nobody can forge it.
 * 2. The client sends it back on every protected request:
 *    Authorization: Bearer <token>
 * 3. requireAuth verifies signature + expiry, then loads the user from the DB.
 *    Fresh DB load = a deleted user or a demoted admin loses access IMMEDIATELY,
 *    even if their old token is still technically valid.
 *
 * optionalAuth does the same work but never blocks: no token / bad token
 * simply continues as anonymous. Used on public routes that benefit from
 * knowing the user (e.g. attributing unanswered questions).
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Session invalid or expired. Please log in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists.');

  req.user = user; // downstream handlers read req.user
  next();
});

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      const user = await User.findById(payload.sub);
      if (user) req.user = user;
    } catch {
      /* invalid or expired token → stay anonymous, never block public routes */
    }
  }
  next();
});

export function requireRole(role) {
  return requireAnyRole([role]);
}

/**
 * Allow any of the given roles (authorization uses the DB-loaded user, not
 * the JWT's role claim — requireAuth/optionalAuth re-read the user from
 * MongoDB on every request, so demotions take effect immediately).
 */
export function requireAnyRole(roles) {
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized(); // 401: not authenticated
    if (!roles.includes(req.user.role)) {
      // 403: authenticated, but this role lacks the permission
      throw ApiError.forbidden(`This action requires the "${roles.join('" or "')}" role.`);
    }
    next();
  };
}

// Convenience stacks for routes
export const adminOnly = [requireAuth, requireRole('admin')];
export const creatorOrAdmin = [requireAuth, requireAnyRole(['creator', 'admin'])];
