/**
 * routes/userRoutes.js — /api/users (admin only)
 */
import { Router } from 'express';
import { listUsers, updateUser, deleteUser } from '../controllers/userController.js';
import { adminOnly } from '../middleware/auth.js';

const router = Router();

router.use(adminOnly); // every route below requires a logged-in admin
router.get('/', listUsers);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
