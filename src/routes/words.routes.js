import { Router } from 'express';
import { requireAdmin } from '../auth/require-admin.js';
import { asyncHandler } from '../http/async-handler.js';
import { translateWord } from '../controllers/words.controller.js';

const router = Router();

router.use(requireAdmin());
router.post('/translate', asyncHandler(translateWord));

export { router };
