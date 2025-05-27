import { Router } from 'express';
import { getSupportedTokens } from '../controllers/token.controller.js';

const router = Router();
router.get('/tokens', getSupportedTokens);

export default router;
