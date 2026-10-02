/**
 * routes/faqRoutes.js — /api/faqs
 *
 * PERMISSION MODEL (role-aligned; the backend is the authority — the UI only
 * hides buttons, it does NOT provide security):
 *   GET  /            → public          (list; embeddings always excluded)
 *   GET  /search      → public          (semantic search via $vectorSearch)
 *   GET  /:id         → public
 *   POST /            → creator OR admin
 *   PATCH /:id        → creator(own) OR admin   ← ownership check in controller
 *   DELETE /:id       → creator(own) OR admin   ← ownership check in controller
 *
 * NOTE: /search must be declared BEFORE /:id so "search" is not treated as an id.
 * The embedding lifecycle runs inside the write controllers, so search always
 * stays in sync with the content.
 */
import { Router } from 'express';
import {
  listFaqs,
  getFaq,
  createFaq,
  updateFaq,
  deleteFaq,
  searchFaqsEndpoint,
} from '../controllers/faqController.js';
import { creatorOrAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', listFaqs);
router.get('/search', searchFaqsEndpoint); // reference-compatible: GET /api/faqs/search?q=...
router.get('/:id', getFaq);
router.post('/', creatorOrAdmin, createFaq);
router.patch('/:id', creatorOrAdmin, updateFaq);
router.delete('/:id', creatorOrAdmin, deleteFaq);

export default router;
