import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/**
 * CONFIG
 * - Utilise la Service Role Key si disponible (recommandé côté serveur)
 * - sinon fallback sur l'ANON (mais alors il te faut des policies INSERT/UPDATE)
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://ighyvkabamlunuikorwc.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE || // ✅ recommandé (bypass RLS)
  process.env.SUPABASE_ANON_KEY;       // ⚠️ nécessite des policies write

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Supabase] ❌ Missing SUPABASE_URL or key (SERVICE_ROLE/ANON)');
  process.exit(1);
}

export const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/** Logs d’erreur utiles */
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

/**
 * HELPERS
 * - on reste collé au schéma:
 *   trades(state enum: ORDER|OPEN|CLOSED|CANCELLED, removed_reason enum: CANCELLED|MARKET|SL|TP|LIQ)
 * - pas de colonnes exec_x6 / pnl_usd6 (elles n'existent pas dans la table)
 */
export async function upsertOpened(row) {
  // row doit contenir au minimum: id, owner_addr, asset_id, long_side, lots, leverage_x, margin_usd6, state, entry_x6/target_x6, sl_x6, tp_x6, liq_x6
  const { data, error } = await supa.from('trades').upsert(row, { onConflict: 'id' });
  logErr('upsertOpened', error, row);
  return { ok: !error, data };
}

export async function markExecuted({ id, entry_x6, tx_hash, block_num }) {
  const { data, error } = await supa
    .from('trades')
    .update({
      state: 'OPEN',
      entry_x6,
      executed_at: new Date().toISOString(),
      last_tx_hash: tx_hash,
      last_block_num: block_num,
    })
    .eq('id', id);
  logErr('markExecuted', error, { id, entry_x6 });
  return { ok: !error, data };
}

export async function updateStops({ id, sl_x6, tp_x6, asset_id, tx_hash, block_num }) {
  // met à jour stops + recompute buckets via la RPC price_to_bucket si elle existe
  let sl_bucket = null;
  let tp_bucket = null;

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

  const { data, error } = await supa
    .from('trades')
    .update({
      sl_x6: sl_x6 || 0,
      tp_x6: tp_x6 || 0,
      sl_bucket,
      tp_bucket,
      last_tx_hash: tx_hash,
      last_block_num: block_num,
    })
    .eq('id', id);
  logErr('updateStops', error, { id, sl_x6, tp_x6, asset_id });
  return { ok: !error, data };
}

/**
 * Removed (fermeture OU annulation)
 * - state = 'CANCELLED' si reason == 0
 * - state = 'CLOSED' sinon
 * - removed_reason = 'CANCELLED' | 'MARKET' | 'SL' | 'TP' | 'LIQ'
 */
export async function markRemoved({ id, reason, tx_hash, block_num }) {
  const reasonMap = ['CANCELLED', 'MARKET', 'SL', 'TP', 'LIQ'];
  const removed_reason = reasonMap[Number(reason)] ?? 'CANCELLED';
  const state = removed_reason === 'CANCELLED' ? 'CANCELLED' : 'CLOSED';

  const fields = {
    state,
    removed_reason,          // enum remove_reason
    last_tx_hash: tx_hash,
    last_block_num: block_num,
  };

  if (state === 'CLOSED') {
    fields.closed_at = new Date().toISOString();
  } else {
    fields.cancelled_at = new Date().toISOString();
  }

  const { data, error } = await supa.from('trades').update(fields).eq('id', id);
  logErr('markRemoved', error, { id, reason, removed_reason, state });
  return { ok: !error, data };
}

/** Health check */
export async function testConnection() {
  const { data, error } = await supa.from('trades').select('id').limit(1);
  if (error) {
    console.error('[Supabase] ❌ Connection failed:', error.message);
  } else {
    console.log('[Supabase] ✅ Connection OK, trades count probe:', data?.length ?? 0);
  }
}

