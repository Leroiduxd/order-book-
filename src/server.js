import express from 'express';
import cors from 'cors';
import routes from './api/index.js';

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' })); // Autorise tous les domaines (public API)

// Routeur principal
app.use('/', routes);

const PORT = 9312;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Brokex API listening on http://51.178.182.7:${PORT}`);
});
