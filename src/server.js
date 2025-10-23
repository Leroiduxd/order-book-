import express from 'express';
import cors from 'cors';
import tradesRoutes from './api/trades.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_, res) => res.json({ status: 'ok', message: 'Brokex API live 🧠' }));
app.use('/trades', tradesRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`[API] Listening on port ${PORT}`));
