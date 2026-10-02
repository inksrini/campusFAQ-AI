/**
 * validators/userValidators.js — request-body checks for auth/user endpoints.
 *
 * THE THREE VALIDATION LAYERS (why this exists despite Mongoose)
 * 1. Frontend validation (HTML required, JS checks) = convenience, easily bypassed.
 * 2. THESE validators = the app's gatekeeping; clean 400s before touching the DB.
 * 3. Mongoose schema validation = the database's last line of defense.
 * Calling the API directly via Postman hits layers 2 and 3 — never trust the client.
 */
import { ApiError } from '../utils/ApiError.js';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function validateRegister(body) {
  const errors = [];
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (name.length < 2 || name.length > 60) errors.push('Name must be 2-60 characters.');
  if (!EMAIL_RE.test(email)) errors.push('A valid email is required.');
  if (password.length < 8) errors.push('Password must be at least 8 characters.');
  if (password.length > 72) errors.push('Password must be at most 72 characters (bcrypt limit).');

  if (errors.length > 0) throw ApiError.badRequest('Registration failed validation.', errors);
  return { name, email, password };
}

export function validateLogin(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!EMAIL_RE.test(email)) throw ApiError.badRequest('A valid email is required.');
  if (!password) throw ApiError.badRequest('Password is required.');
  return { email, password };
}

export function validateUserUpdate(body) {
  const errors = [];
  const update = {};

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 60) errors.push('Name must be 2-60 characters.');
    else update.name = name;
  }
  if (body.role !== undefined) {
    if (body.role === 'user' || body.role === 'creator' || body.role === 'admin') update.role = body.role;
    else errors.push('Role must be "user", "creator" or "admin".');
  }

  if (errors.length > 0) throw ApiError.badRequest('Update failed validation.', errors);
  if (Object.keys(update).length === 0) throw ApiError.badRequest('Nothing to update. Provide "name" and/or "role".');
  return update;
}
