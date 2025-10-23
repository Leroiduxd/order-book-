import express from 'express';
import { supa } from '../lib/supabase.js';

const router = express.Router();

/* ----------------------------------------------
   1️⃣ Liste complète des positions d’un trader
   ---------------------------------------------- */
router.get('/by-trader/:address', async (req, res) => {
  const addr = req.params.address.toLowerCase();
  try {
    const { data, error } = await supa
      .from('trades')
      .select('*')
      .eq('owner_addr', addr)
      .order('id', { ascending: false });

    if (error) throw error;

    // Regroupe par état
    const grouped = {
      OPEN: [],
      ORDER: [],
      CLOSED: [],
      CANCELLED: []
    };

    for (const t of data) {
      grouped[t.state]?.push(t);
    }

    res.json({
      trader: addr,
      counts: Object.fromEntries(
        Object.entries(grouped).map(([k, v]) => [k, v.length])
      ),
      positions: grouped
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------------------------------------
   2️⃣ Récupérer tous les ordres/stops/liquidations par tick
   ---------------------------------------------------- */
router.get('/by-price', async (req, res) => {
  const { asset, price_x6 } = req.query;
  if (!asset || !price_x6)
    return res.status(400).json({ error: 'asset & price_x6 required' });

  try {
    const { data, error } = await supa.rpc('price_to_bucket', {
      _asset_id: Number(asset),
      _price_x6: price_x6
    });
    if (error) throw error;

    const bucket = data;
    if (bucket === null)
      return res.status(404).json({ error: 'No bucket for this price' });

    // On cherche dans les 4 colonnes bucket
    const { data: trades, error: err2 } = await supa
      .from('trades')
      .select('id,asset_id,owner_addr,state,sl_x6,tp_x6,liq_x6,target_x6,sl_bucket,tp_bucket,liq_bucket,target_bucket')
      .eq('asset_id', Number(asset))
      .or(
        `target_bucket.eq.${bucket},sl_bucket.eq.${bucket},tp_bucket.eq.${bucket},liq_bucket.eq.${bucket}`
      );

    if (err2) throw err2;

    // Classement par type
    const orders = { LIMIT: [], SL: [], TP: [], LIQ: [] };
    for (const t of trades) {
      if (t.target_bucket === bucket) orders.LIMIT.push(t);
      if (t.sl_bucket === bucket) orders.SL.push(t);
      if (t.tp_bucket === bucket) orders.TP.push(t);
      if (t.liq_bucket === bucket) orders.LIQ.push(t);
    }

    res.json({ asset: Number(asset), price_x6, bucket, orders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------------------------------
   3️⃣ Infos détaillées d’une position (id)
   ---------------------------------------------- */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const { data, error } = await supa
      .from('trades')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Trade not found' });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
