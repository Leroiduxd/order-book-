import { makeProvider, makeContract, extractTxMeta } from '../lib/provider.js';
import { markExecuted, supa } from '../lib/supabase.js';
import { EventCache } from '../lib/cache.js';

const cache = new EventCache();

// --- CONFIG ---
const CURSOR_ID = 'executed';
const BATCH_BLOCKS = Number(process.env.BATCH_BLOCKS || 2000);
const SLEEP_MS = Number(process.env.BATCH_SLEEP_MS || 250); // petite pause entre batches

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- cursor helpers (Supabase) ---
async function loadCursor() {
  const { data, error } = await supa
    .from('ingest_cursors')
    .select('last_block')
    .eq('id', CURSOR_ID)
    .maybeSingle();
  if (error) {
    console.warn('[executed] cursor load warn:', error.message);
    return 0;
  }
  return data?.last_block ? Number(data.last_block) : 0;
}

async function saveCursor(blockNumber) {
  const { error } = await supa
    .from('ingest_cursors')
    .upsert({ id: CURSOR_ID, last_block: Number(blockNumber) });
  if (error) console.warn('[executed] cursor save warn:', error.message, { blockNumber });
}

// --- process a single log ---
async function handleExecutedLog(log) {
  // ethers v6: log.args = [id, entryX6], log.transactionHash, log.blockNumber, log.logIndex
  const id = Number(log.args[0]);
  const entryX6 = log.args[1];

  const txHash = log.transactionHash;
  const blockNum = Number(log.blockNumber);
  const key = `executed:${txHash}:${log.logIndex}`;

  if (cache.has(key)) return;
  cache.add(key);

  await markExecuted({
    id,
    entry_x6: BigInt(entryX6).toString(),
    tx_hash: txHash,
    block_num: blockNum
  });

  // avance le curseur au bloc de ce log (idempotent)
  await saveCursor(blockNum);

  console.log('[Executed]', { id, txHash, blockNum, logIndex: log.logIndex });
}

// --- backfill from last cursor to tip ---
async function backfill(contract, provider) {
  let from = await loadCursor();
  const latest = await provider.getBlockNumber();

  // si jamais START_FROM est posé, on peut forcer un démarrage plus tôt
  const envStart = Number(process.env.START_BLOCK || 0);
  if (envStart && envStart < from) {
    from = envStart;
  }
  // on commence à +1 si déjà traité
  if (from > 0) from = from + 1;

  if (from > latest) return;

  console.log(`[listener/executed] backfill from ${from} to ${latest}…`);

  let start = from;
  while (start <= latest) {
    const end = Math.min(start + BATCH_BLOCKS - 1, latest);
    try {
      const logs = await contract.queryFilter('Executed', start, end);
      if (logs.length) {
        // trie par (blockNumber, logIndex) pour l’ordre déterministe
        logs.sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? a.logIndex - b.logIndex
            : a.blockNumber - b.blockNumber
        );
        for (const log of logs) {
          // dédoublonnage fin par (txHash:logIndex)
          await handleExecutedLog(log);
        }
      }
      await saveCursor(end);
      console.log(`[listener/executed] backfilled ${logs.length} logs in [${start}, ${end}]`);
    } catch (e) {
      console.error(`[listener/executed] backfill error in [${start}, ${end}]`, e);
      // petite pause avant retry du prochain batch
      await sleep(1000);
    }
    start = end + 1;
    if (SLEEP_MS) await sleep(SLEEP_MS);
  }

  console.log('[listener/executed] backfill complete.');
}

// --- live subscription with reconnect guard ---
async function main() {
  const provider = makeProvider();
  const contract = makeContract(provider);

  console.log('[listener/executed] starting…');

  // 1) BACKFILL d’abord
  await backfill(contract, provider);

  // 2) LIVE
  console.log('[listener/executed] listening Executed (live)…');
  contract.on('Executed', async (...args) => {
    try {
      const evt = args[args.length - 1];
      // ethers v6 event object; on reconstitue un log-like shape
      const log = {
        args,
        transactionHash: evt.transactionHash,
        blockNumber: evt.blockNumber,
        logIndex: evt.logIndex
      };
      await handleExecutedLog(log);
    } catch (e) {
      console.error('[listener/executed] live handler error', e);
    }
  });

  // 3) Sur fermeture WS → on quitte, PM2 relancera, et on refera un backfill au boot
  provider._websocket?.on?.('close', async (code) => {
    console.error('[listener/executed] WS closed', code);
    process.exit(1);
  });

  // 4) Sur “open”, on peut rechecker s’il manque des blocs
  provider._websocket?.on?.('open', async () => {
    try {
      const latest = await provider.getBlockNumber();
      const cursor = await loadCursor();
      if (cursor < latest) {
        console.log('[listener/executed] WS re-open: cursor behind tip → backfill…');
        await backfill(contract, provider);
      }
    } catch (e) {
      console.warn('[listener/executed] re-open check warn', e?.message);
    }
  });
}

main().catch((e) => {
  console.error('[listener/executed] fatal', e);
  process.exit(1);
});

