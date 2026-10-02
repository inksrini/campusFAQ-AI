/**
 * controllers/userController.js — admin-only user management.
 * All routes here are guarded by requireAuth + requireRole('admin').
 */
import { User } from '../models/User.js';
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { validateObjectId } from '../validators/faqValidators.js';
import { validateUserUpdate } from '../validators/userValidators.js';

/** GET /api/users — admin only. */
export const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Number.parseInt(req.query.limit ?? '50', 10) || 50);

  const [users, total] = await Promise.all([
    User.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(),
  ]);

  return ok(res, { items: users.map((u) => u.toSafeJSON()), page, total, pages: Math.ceil(total / limit) });
});

/** PATCH /api/users/:id — admin only (e.g. promote a user to admin). */
export const updateUser = asyncHandler(async (req, res) => {
  const id = validateObjectId(req.params.id, 'user id');
  const update = validateUserUpdate(req.body);

  if (req.user.id !== undefined && id === req.user.id && update.role === 'user') {
    throw ApiError.badRequest('You cannot demote your own admin account.');
  }

  const user = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('User not found.');
  return ok(res, { user: user.toSafeJSON() });
});

/** DELETE /api/users/:id — admin only. */
export const deleteUser = asyncHandler(async (req, res) => {
  const id = validateObjectId(req.params.id, 'user id');
  if (id === req.user.id) throw ApiError.badRequest('You cannot delete your own account.');
  const user = await User.findByIdAndDelete(id);
  if (!user) throw ApiError.notFound('User not found.');
  return ok(res, { message: 'User deleted.' });
});
