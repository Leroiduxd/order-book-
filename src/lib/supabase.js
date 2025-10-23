import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://ighyvkabamlunuikorwc.supabase.co';

// ⚙️ Utilise la Service Role Key si dispo (pour bypasser RLS)
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnaHl2a2FiYW1sdW51aWtvcndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMjIzMDgsImV4cCI6MjA3Njc5ODMwOH0.gyGvLwrozsQNPXXee-cSqxDRHDkqvJydpJ8nveTWi3I';

export const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// --- FONCTIONS UTILITAIRES DE LOG ---

function logError(prefix, error) {
  if (!error) return;
  console.error(`[Supabase] ${prefix} error:`, error.message || error);
}

// --- FONCTIONS PRINCIPALES ---

// 🔹 Nouvelle position (Opened)
export async function upsertOpened(data) {
  const { error } = await supa.from('trades').upsert(data);
  logError('upsertOpened', error);
  return !error;
}

// 🔹 Marquer ordre exécuté
export async function markExecuted(data) {
  const { error } = await supa
    .from('trades')
    .update({
      state: 'OPEN',
      entry_x6: data.entry_x6,
      tx_hash: data.tx_hash,
      block_num: data.block_num,
    })
    .eq('id', data.id);
  logError('markExecuted', error);
  return !error;
}

// 🔹 Mise à jour SL/TP
export async function updateStops(data) {
  const { error } = await supa
    .from('trades')
    .update({
      sl_x6: data.sl_x6,
      tp_x6: data.tp_x6,
      tx_hash: data.tx_hash,
      block_num: data.block_num,
    })
    .eq('id', data.id);
  logError('updateStops', error);
  return !error;
}

// 🔹 Fermeture / annulation (Removed)
export async function markRemoved(data) {
  const { error } = await supa
    .from('trades')
    .update({
      state:
        data.reason === 0
          ? 'CANCELLED'
          : data.reason === 1
          ? 'CLOSED_MARKET'
          : data.reason === 2
          ? 'CLOSED_SL'
          : data.reason === 3
          ? 'CLOSED_TP'
          : 'CLOSED_LIQ',
      exec_x6: data.exec_x6,
      pnl_usd6: data.pnl_usd6,
      tx_hash: data.tx_hash,
      block_num: data.block_num,
    })
    .eq('id', data.id);
  logError('markRemoved', error);
  return !error;
}

// 🔹 Health check (utile pour debug)
export async function testConnection() {
  try {
    const { error } = await supa.from('trades').select('id').limit(1);
    if (error) throw error;
    console.log('[Supabase] ✅ Connection OK');
  } catch (e) {
    console.error('[Supabase] ❌ Connection failed:', e.message);
  }
}

