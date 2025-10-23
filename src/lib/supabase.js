import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/* -------------------- CONFIG -------------------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Supabase] ❌ Missing SUPABASE_URL or SUPABASE_* key in .env');
  process.exit(1);
}

export const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/* -------------------- LOG UTILS -------------------- */
function logErr(prefix, error, extra) {
  if (!error) return;
  console.error(`[Supabase] ${prefix} ERROR ->`, {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    extra,
  });
}

/* -------------------- HELPERS -------------------- */
/** Coerce/clean rows for `trades` to match schema */
function normalizeTradeRow(row) {
  return {
    id: row.id,
    owner_addr: row.owner_addr ?? '0x',
    asset_id: row.asset_id,
    long_side: !!row.long_side,
    lots: Number(row.lots ?? 0),
    leverage_x: Number(row.leverage_x ?? 1),          // fallback: 1 (colonne NOT NULL)
    margin_usd6: row.margin_usd6 ?? 0,

    state: row.state,                                  // 'ORDER' | 'OPEN' | 'CLOSED' | 'CANCELLED'

    entry_x6: row.entry_x6 ?? 0,
    target_x6: row.target_x6 ?? 0,
    sl_x6: row.sl_x6 ?? 0,
    tp_x6: row.tp_x6 ?? 0,
    liq_x6: row.liq_x6 ?? 0,

    // noms alignés avec le schéma:
    last_tx_hash: row.tx_hash ?? row.last_tx_hash ?? null,
    last_block_num: row.block_num ?? row.last_block_num ?? null,

    // buckets si déjà calculés en amont (sinon laissés à null)
    target_bucket: row.target_bucket ?? null,
    sl_bucket: row.sl_bucket ?? null,
    tp_bucket: row.tp_bucket ?? null,
    liq_bucket: row.liq_bucket ?? null,
  };
}

/* -------------------- API -------------------- */

// 🔹 Nouvelle position (Opened)
export async function upsertOpened(row) {
  const clean = normalizeTradeRow(row);
  const { data, error } = await supa
    .from('trades')
    .upsert(clean, { onConflict: 'id' });
  logErr('upsertOpened', error, clean);
  return { ok: !error, data };
}

// 🔹 Marquer ordre exécuté (ORDER -> OPEN)
export async function markExecuted({ id, entry_x6, tx_hash, block_num }) {
  const patch = {
    state: 'OPEN',
    entry_x6,
    executed_at: new Date().toISOString(),
    last_tx_hash: tx_hash ?? null,
    last_block_num: block_num ?? null,
  };
  const { data, error } = await supa
    .from('trades')
    .update(patch)
    .eq('id', id);
  logErr('markExecuted', error, { id, patch });
  return { ok: !error, data };
}

// 🔹 Mise à jour SL/TP (+ recompute buckets si la RPC existe)
export async function updateStops({ id, sl_x6, tp_x6, asset_id, tx_hash, block_num }) {
  let sl_bucket = null;
  let tp_bucket = null;

  // calcul buckets (si la RPC 'price_to_bucket' est créée)
  try {
    if (asset_id && sl_x6 && sl_x6 !== '0') {
      const r = await supa.rpc('price_to_bucket', { _asset_id: asset_id, _price_x6: sl_x6 });
      if (!r.error) sl_bucket = r.data ?? null;
    }
    if (asset_id && tp_x6 && tp_x6 !== '0') {
      const r = await supa.rpc('price_to_bucket', { _asset_id: asset_id, _price_x6: tp_x6 });
      if (!r.error) tp_bucket = r.data ?? null;
    }
  } catch (e) {
    console.warn('[Supabase] updateStops bucket compute warn:', e?.message);
  }

  const patch = {
    sl_x6: sl_x6 || 0,
    tp_x6: tp_x6 || 0,
    sl_bucket,
    tp_bucket,
    last_tx_hash: tx_hash ?? null,
    last_block_num: block_num ?? null,
  };

  const { data, error } = await supa
    .from('trades')
    .update(patch)
    .eq('id', id);
  logErr('updateStops', error, { id, patch });
  return { ok: !error, data };
}

/**
 * 🔹 Removed (fermeture OU annulation)
 * - state = 'CANCELLED' si reason == 0
 * - state = 'CLOSED' sinon
 * - removed_reason = 'CANCELLED' | 'MARKET' | 'SL' | 'TP' | 'LIQ'
 */
export async function markRemoved({ id, reason, tx_hash, block_num }) {
  const reasonMap = ['CANCELLED', 'MARKET', 'SL', 'TP', 'LIQ'];
  const removed_reason = reasonMap[Number(reason)] ?? 'CANCELLED';
  const state = removed_reason === 'CANCELLED' ? 'CANCELLED' : 'CLOSED';

  const patch = {
    state,
    removed_reason,                 // enum remove_reason
    last_tx_hash: tx_hash ?? null,
    last_block_num: block_num ?? null,
  };

  if (state === 'CLOSED') {
    patch.closed_at = new Date().toISOString();
  } else {
    patch.cancelled_at = new Date().toISOString();
  }

  const { data, error } = await supa
    .from('trades')
    .update(patch)
    .eq('id', id);
  logErr('markRemoved', error, { id, patch });
  return { ok: !error, data };
}

/* -------------------- HEALTH -------------------- */
export async function testConnection() {
  const { data, error } = await supa.from('trades').select('id').limit(1);
  if (error) {
    console.error('[Supabase] ❌ Connection failed:', error.message);
  } else {
    console.log('[Supabase] ✅ Connection OK, sample length:', data?.length ?? 0);
  }
}

