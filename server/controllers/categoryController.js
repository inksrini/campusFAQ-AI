/**
 * controllers/categoryController.js — category CRUD.
 *
 * DELETE POLICY (important design decision)
 * A category that still has FAQs CANNOT be deleted: we answer 409 Conflict.
 * Why not cascade-delete the FAQs? Because FAQs are the trusted knowledge
 * base — silently destroying verified answers because a label was removed is
 * data loss. Why not leave orphans? Because FAQs would point at a category
 * that no longer exists. Blocking is the simplest correct behavior.
 */
import { Category } from '../models/Category.js';
import { FAQ } from '../models/FAQ.js';
import { ok, created } from '../utils/responses.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { validateObjectId } from '../validators/faqValidators.js';
import { validateCategoryCreate, validateCategoryUpdate } from '../validators/categoryValidators.js';

/** GET /api/categories — public, includes a faqCount for the browse UI. */
export const listCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ name: 1 }).lean();
  const counts = await FAQ.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);

  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  const items = categories.map((c) => ({
    id: c._id,
    name: c.name,
    description: c.description,
    faqCount: countMap.get(String(c._id)) ?? 0,
    createdAt: c.createdAt,
  }));
  return ok(res, { items });
});

/** POST /api/categories — admin only. */
export const createCategory = asyncHandler(async (req, res) => {
  const data = validateCategoryCreate(req.body);
  const category = await Category.create(data);
  return created(res, { category });
});

/** PATCH /api/categories/:id — admin only. */
export const updateCategory = asyncHandler(async (req, res) => {
  const id = validateObjectId(req.params.id, 'category id');
  const update = validateCategoryUpdate(req.body);
  const category = await Category.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  if (!category) throw ApiError.notFound('Category not found.');
  return ok(res, { category });
});

/** DELETE /api/categories/:id — admin only; 409 if FAQs still reference it. */
export const deleteCategory = asyncHandler(async (req, res) => {
  const id = validateObjectId(req.params.id, 'category id');
  const faqCount = await FAQ.countDocuments({ category: id });
  if (faqCount > 0) {
    throw ApiError.conflict(
      `This category still has ${faqCount} FAQ(s). Reassign or delete them first.`
    );
  }
  const category = await Category.findByIdAndDelete(id);
  if (!category) throw ApiError.notFound('Category not found.');
  return ok(res, { message: 'Category deleted.' });
});
