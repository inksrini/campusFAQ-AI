/**
 * controllers/authController.js — register, login, me.
 *
 * HOW LOGIN WORKS (concept recap)
 * 1. bcrypt compares the typed password against the stored HASH (one-way).
 * 2. On success we SIGN a JWT containing { sub: userId, role } with
 *    JWT_SECRET. The client stores it and sends "Authorization: Bearer <token>".
 * 3. Middleware (middleware/auth.js) verifies it on protected routes.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { ok, created, fail } from '../utils/responses.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { validateRegister, validateLogin } from '../validators/userValidators.js';

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/** POST /api/auth/register — public. Admins are never self-registered. */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = validateRegister(req.body);
  const hash = await bcrypt.hash(password, env.bcryptSaltRounds);
  const user = await User.create({ name, email, password: hash, role: 'user' });
  return created(res, { user: user.toSafeJSON() });
});

/** POST /api/auth/login — public, same endpoint for students and admins. */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = validateLogin(req.body);

  const user = await User.findOne({ email }).select('+password'); // hash hidden by default
  if (!user) return fail(res, 'Invalid email or password.', 401); // vague on purpose

  const match = await bcrypt.compare(password, user.password);
  if (!match) return fail(res, 'Invalid email or password.', 401);

  return ok(res, { token: signToken(user), user: user.toSafeJSON() });
});

/** GET /api/auth/me — requires a valid JWT. */
export const me = asyncHandler(async (req, res) => {
  return ok(res, { user: req.user.toSafeJSON() });
});

/** POST /api/auth/logout — the client just deletes its token; kept for API completeness. */
export const logout = asyncHandler(async (_req, res) => {
  return ok(res, { message: 'Logged out. Delete the token on the client.' });
});
