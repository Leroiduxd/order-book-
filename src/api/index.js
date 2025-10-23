import express from 'express';
import tradesRoutes from './trades.js';

const router = express.Router();

router.use('/trades', tradesRoutes);

// Endpoint de santé de l’API
router.get('/', (_, res) => {
  res.json({ ok: true, service: 'Brokex REST API', version: '1.0.0' });
});

export default router;
