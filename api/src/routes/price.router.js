import { Router } from 'express';
import { getCoinPrices } from '../controllers/price.controller.js';

const router = Router();
router.get('/price', getCoinPrices);

export default router;
