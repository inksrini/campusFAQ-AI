/**
 * routes/aiRoutes.js — /api/ai (reference-compatible surface)
 *
 * POST /api/ai/generate-faq → creator OR admin.
 * THIN ALIAS: it calls the SAME controller as POST /api/admin/generate-faq-drafts
 * (generateDrafts in adminController.js), so validation (required source notes),
 * the Gemini service, and the human-review workflow are shared — no duplicated
 * business logic. Drafts are returned for review and NEVER auto-saved.
 */
import { Router } from 'express';
import { generateDrafts } from '../controllers/adminController.js';
import { creatorOrAdmin } from '../middleware/auth.js';

const router = Router();

router.post('/generate-faq', creatorOrAdmin, generateDrafts);

export default router;
