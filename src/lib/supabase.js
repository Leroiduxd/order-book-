import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/* -------------------- CONFIG -------------------- */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Supabase] ❌ Missing SUPABASE_URL or SUPABASE_* key');
  process.exit(1);
}

export const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/* -------------------- UTILS -------------------- */
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

const WAD = 10n ** 18n;

function toBI(v) {
  if (v === null || v === undefined) return 0n;
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  if (typeof v === 'string') return v.trim() ? BigInt(v) : 0n;
  return 0n;
}

function ceilDiv(a, b) {
  return (a + (b - 1n)) / b;
}

/* -------------------- ASSETS & BUCKETS -------------------- */
async function getAsset(asset_id) {
  const { data, error } = await supa
    .from('assets')
    .select('id, tick_x6, lot_num, lot_den')
    .eq('id', asset_id)
    .maybeSingle();
  if (error) console.warn('[Supabase] getAsset warn', error.message);
  return data || null;
}

async function priceToBucket(asset_id, price_x6) {
  const px = toBI(price_x6);
  if (px === 0n) return null;
  const { data, error } = await supa.rpc('price_to_bucket', {
    _asset_id: asset_id,
    _price_x6: px.toString(),
  });
  if (error) {
    console.warn('[Supabase] price_to_bucket warn:', error.message);
    return null;
  }
  return data ?? null;
}

/* -------------------- NORMALIZE -------------------- */
function normalizeTradeRow(row) {
  return {
    id: row.id,
    owner_addr: row.owner_addr ?? '0x',
    asset_id: row.asset_id,
    long_side: !!row.long_side,
    lots: Number(row.lots ?? 0),
    leverage_x: Number(row.leverage_x ?? 1),
    margin_usd6: Number(row.margin_usd6 ?? 0),

    state: row.state, // 'ORDER' | 'OPEN' | 'CLOSED' | 'CANCELLED'

    entry_x6: row.entry_x6 ?? 0,
    target_x6: row.target_x6 ?? 0,
    sl_x6: row.sl_x6 ?? 0,
    tp_x6: row.tp_x6 ?? 0,
    liq_x6: row.liq_x6 ?? 0,

    last_tx_hash: row.last_tx_hash ?? null,
    last_block_num: row.last_block_num ?? null,

    target_bucket: row.target_bucket ?? null,
    sl_bucket: row.sl_bucket ?? null,
    tp_bucket: row.tp_bucket ?? null,
    liq_bucket: row.liq_bucket ?? null,
  };
}

/* -------------------- API -------------------- */
/**
 * OPENED:
 * margin_usd6 = ceil( (qty1e18 * priceX6 / 1e18) / leverage )
 * avec qty1e18 = lots * 1e18 * lot_num / lot_den
 * (lot_num/lot_den viennent de la table assets, ex: BTC 1/100 => 0.01 BTC / lot)
 */
export async function upsertOpened(rowIn) {
  // 1) Asset & ratios lot
  const asset = await getAsset(rowIn.asset_id);
  if (!asset) {
    logErr('upsertOpened', { message: 'asset_id not found in assets (FK)' }, rowIn);
    return { ok: false };
  }

  const lots = toBI(rowIn.lots ?? 0);
  const lev  = toBI(rowIn.leverage_x ?? 1);

  // lot_num / lot_den peuvent être NUMERIC → on les convertit en BigInt proprement
  const lotNum = toBI(asset.lot_num ?? '1'); // ex: '1'
  const lotDen = toBI(asset.lot_den ?? '1'); // ex: '100'
  const priceX6 = rowIn.state === 'OPEN'
    ? toBI(rowIn.entry_x6)
    : toBI(rowIn.target_x6);

  // qty1e18 = lots * 1e18 * lotNum / lotDen
  const qty1e18 = (lotDen === 0n) ? 0n : (lots * WAD * lotNum) / lotDen;

  // notional(USD6) = qty1e18 * priceX6 / 1e18
  const notionalUsd6 = (qty1e18 * priceX6) / WAD;

  // margin = ceil(notional / leverage)
  const marginUsd6 = (lev === 0n) ? 0n : ceilDiv(notionalUsd6, lev);

  // 2) Buckets (ticks)
  const [target_bucket, sl_bucket, tp_bucket, liq_bucket] = await Promise.all([
    rowIn.state === 'ORDER' ? priceToBucket(rowIn.asset_id, rowIn.target_x6) : Promise.resolve(null),
    rowIn.sl_x6 && rowIn.sl_x6 !== '0' ? priceToBucket(rowIn.asset_id, rowIn.sl_x6) : Promise.resolve(null),
    rowIn.tp_x6 && rowIn.tp_x6 !== '0' ? priceToBucket(rowIn.asset_id, rowIn.tp_x6) : Promise.resolve(null),
    rowIn.liq_x6 && rowIn.liq_x6 !== '0' ? priceToBucket(rowIn.asset_id, rowIn.liq_x6) : Promise.resolve(null),
  ]);

  // 3) Upsert
  const row = normalizeTradeRow({
    ...rowIn,
    leverage_x: Number(lev),
    margin_usd6: Number(marginUsd6),
    target_bucket, sl_bucket, tp_bucket, liq_bucket,
  });

  const { data, error } = await supa
    .from('trades')
    .upsert(row, { onConflict: 'id' });
  logErr('upsertOpened', error, row);
  return { ok: !error, data };
}

export async function markExecuted({ id, entry_x6, tx_hash, block_num }) {
  const patch = {
    state: 'OPEN',
    entry_x6,
    executed_at: new Date().toISOString(),
    last_tx_hash: tx_hash ?? null,
    last_block_num: block_num ?? null,
  };
  const { data, error } = await supa.from('trades').update(patch).eq('id', id);
  logErr('markExecuted', error, { id, patch });
  return { ok: !error, data };
}

export async function updateStops({ id, sl_x6, tp_x6, asset_id, tx_hash, block_num }) {
  let sl_bucket = null;
  let tp_bucket = null;

  try {
    if (asset_id && sl_x6 && sl_x6 !== '0') {
      const r1 = await supa.rpc('price_to_bucket', { _asset_id: asset_id, _price_x6: sl_x6 });
      if (!r1.error) sl_bucket = r1.data ?? null;
    }
    if (asset_id && tp_x6 && tp_x6 !== '0') {
      const r2 = await supa.rpc('price_to_bucket', { _asset_id: asset_id, _price_x6: tp_x6 });
      if (!r2.error) tp_bucket = r2.data ?? null;
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

  const { data, error } = await supa.from('trades').update(patch).eq('id', id);
  logErr('updateStops', error, { id, patch });
  return { ok: !error, data };
}

export async function markRemoved({ id, reason, tx_hash, block_num }) {
  const reasonMap = ['CANCELLED', 'MARKET', 'SL', 'TP', 'LIQ'];
  const removed_reason = reasonMap[Number(reason)] ?? 'CANCELLED';
  const state = removed_reason === 'CANCELLED' ? 'CANCELLED' : 'CLOSED';

  const patch = {
    state,
    removed_reason,
    last_tx_hash: tx_hash ?? null,
    last_block_num: block_num ?? null,
  };
  if (state === 'CLOSED') patch.closed_at = new Date().toISOString();
  else patch.cancelled_at = new Date().toISOString();

  const { data, error } = await supa.from('trades').update(patch).eq('id', id);
  logErr('markRemoved', error, { id, patch });
  return { ok: !error, data };
}

export async function testConnection() {
  const { data, error } = await supa.from('trades').select('id').limit(1);
  if (error) console.error('[Supabase] ❌ Connection failed:', error.message);
  else console.log('[Supabase] ✅ Connection OK, sample length:', data?.length ?? 0);
}

