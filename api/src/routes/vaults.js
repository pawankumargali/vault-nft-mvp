// api/src/routes/vaults.js
import express from 'express';
import { getVaultsController } from '../controllers/vaultsController.js';

const router = express.Router();

router.get('/vaults', getVaultsController); // Changed to /vaults to be mounted under /api/v1

export default router;
