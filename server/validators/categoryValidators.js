/**
 * validators/categoryValidators.js — request-body checks for category endpoints.
 * Same three-layer story as userValidators: these run BEFORE the database.
 */
import { ApiError } from '../utils/ApiError.js';

export function validateCategoryCreate(body) {
  const errors = [];
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (name.length < 2 || name.length > 50) errors.push('Category name must be 2-50 characters.');
  if (description.length > 200) errors.push('Description must be at most 200 characters.');

  if (errors.length > 0) throw ApiError.badRequest('Category failed validation.', errors);
  return { name, description };
}

export function validateCategoryUpdate(body) {
  const errors = [];
  const update = {};

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 50) errors.push('Category name must be 2-50 characters.');
    else update.name = name;
  }
  if (body.description !== undefined) {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length > 200) errors.push('Description must be at most 200 characters.');
    else update.description = description;
  }

  if (errors.length > 0) throw ApiError.badRequest('Update failed validation.', errors);
  if (Object.keys(update).length === 0) throw ApiError.badRequest('Nothing to update. Provide "name" and/or "description".');
  return update;
}
