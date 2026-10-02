/**
 * routes/adminRoutes.js — /api/admin (all admin-only)
 */
import { Router } from 'express';
import {
  generateDrafts,
  listUnanswered,
  updateUnanswered,
  stats,
} from '../controllers/adminController.js';
import { adminOnly } from '../middleware/auth.js';

const router = Router();

router.use(adminOnly);

router.post('/generate-faq-drafts', generateDrafts);
router.get('/unanswered', listUnanswered);
router.patch('/unanswered/:id', updateUnanswered);
router.get('/stats', stats);

export default router;
