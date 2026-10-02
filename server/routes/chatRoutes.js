/**
 * routes/chatRoutes.js — /api/chat (public)
 * optionalAuth attaches the user ONLY if a valid token was sent; it never
 * blocks anonymous users (search/chat are public per the approved design).
 */
import { Router } from 'express';
import { chat } from '../controllers/chatController.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();
router.post('/', optionalAuth, chat);

export default router;
