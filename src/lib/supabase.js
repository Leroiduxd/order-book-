import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';

export const supa = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

// bucket helper via RPC (price_to_bucket)
export async function priceToBucket(asset_id, price_x6) {
  if (!price_x6 || price_x6 === 0) return null;
  const { data, error } = await supa.rpc('price_to_bucket', { _asset_id: asset_id, _price_x6: price_x6 });
  if (error) {
    console.error('[supa.price_to_bucket] error', error);
    return null;
  }
  return data ?? null;
}

// UPSERT trade on Opened
export async function upsertOpened({
  id, owner_addr, asset_id, long_side, lots, leverage_x, margin_usd6,
  state, entry_x6, target_x6, sl_x6, tp_x6, liq_x6, tx_hash, block_num
}) {
  // compute buckets
  const [target_bucket, sl_bucket, tp_bucket, liq_bucket] = await Promise.all([
    target_x6 ? priceToBucket(asset_id, target_x6) : null,
    sl_x6 ? priceToBucket(asset_id, sl_x6) : null,
    tp_x6 ? priceToBucket(asset_id, tp_x6) : null,
    liq_x6 ? priceToBucket(asset_id, liq_x6) : null
  ]);

  const row = {
    id, owner_addr, asset_id,
    long_side, lots,
    leverage_x: leverage_x ?? null,
    margin_usd6: margin_usd6 ?? 0,
    state,
    entry_x6: entry_x6 || 0,
    target_x6: target_x6 || 0,
    sl_x6: sl_x6 || 0,
    tp_x6: tp_x6 || 0,
    liq_x6: liq_x6 || 0,
    last_tx_hash: tx_hash,
    last_block_num: block_num,
    target_bucket, sl_bucket, tp_bucket, liq_bucket
  };

  const { error } = await supa.from('trades').upsert(row, { onConflict: 'id' });
  if (error) console.error('[supa.upsertOpened] error', error, row);
}

// Executed => ORDER -> OPEN
export async function markExecuted({ id, entry_x6, tx_hash, block_num }) {
  const { error } = await supa
    .from('trades')
    .update({
      state: 'OPEN',
      entry_x6,
      executed_at: new Date().toISOString(),
      last_tx_hash: tx_hash,
      last_block_num: block_num
    })
    .eq('id', id);
  if (error) console.error('[supa.markExecuted] error', error, { id });
}

// StopsUpdated
export async function updateStops({ id, sl_x6, tp_x6, asset_id, tx_hash, block_num }) {
  const [sl_bucket, tp_bucket] = await Promise.all([
    sl_x6 ? priceToBucket(asset_id, sl_x6) : null,
    tp_x6 ? priceToBucket(asset_id, tp_x6) : null
  ]);

  const { error } = await supa
    .from('trades')
    .update({
      sl_x6: sl_x6 || 0,
      tp_x6: tp_x6 || 0,
      sl_bucket,
      tp_bucket,
      last_tx_hash: tx_hash,
      last_block_num: block_num
    })
    .eq('id', id);
  if (error) console.error('[supa.updateStops] error', error, { id });
}

// Removed (CLOSED ou CANCELLED)
export async function markRemoved({ id, reason, exec_x6, pnl_usd6, tx_hash, block_num }) {
  const reasonMap = ['CANCELLED','MARKET','SL','TP','LIQ']; // 0..4
  const reasonTxt = reasonMap[reason] ?? 'CANCELLED';
  const state = reasonTxt === 'CANCELLED' ? 'CANCELLED' : 'CLOSED';

  const fields = {
    state,
    removed_reason: reasonTxt,
    last_tx_hash: tx_hash,
    last_block_num: block_num
  };
  if (state === 'CLOSED') {
    fields.closed_at = new Date().toISOString();
  } else {
    fields.cancelled_at = new Date().toISOString();
  }

  const { error } = await supa
    .from('trades')
    .update(fields)
    .eq('id', id);
  if (error) console.error('[supa.markRemoved] error', error, { id });
}
