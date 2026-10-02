/**
 * routes/index.js — mounts every route group under /api.
 * One glance shows the whole API surface.
 */
import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import faqRoutes from './faqRoutes.js';
import searchRoutes from './searchRoutes.js';
import chatRoutes from './chatRoutes.js';
import aiRoutes from './aiRoutes.js';
import adminRoutes from './adminRoutes.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import mongoose from 'mongoose';

const router = Router();

/** GET /api/health — public. First endpoint to test once the server runs. */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'not connected',
        time: new Date().toISOString(),
      },
    });
  })
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/faqs', faqRoutes);
router.use('/search', searchRoutes);
router.use('/chat', chatRoutes);
router.use('/ai', aiRoutes); // reference-compatible AI surface (creator/admin)
router.use('/admin', adminRoutes);

export default router;
