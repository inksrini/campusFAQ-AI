/**
 * routes/categoryRoutes.js — /api/categories
 * Reads are public (college info is open); writes require an admin.
 */
import { Router } from 'express';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import { adminOnly } from '../middleware/auth.js';

const router = Router();

router.get('/', listCategories);
router.post('/', adminOnly, createCategory);
router.patch('/:id', adminOnly, updateCategory);
router.delete('/:id', adminOnly, deleteCategory);

export default router;
