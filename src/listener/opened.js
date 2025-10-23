import { makeProvider, makeContract, extractTxMeta } from '../lib/provider.js';
import { upsertOpened } from '../lib/supabase.js';
import { EventCache } from '../lib/cache.js';

const cache = new EventCache();

const main = async () => {
  const provider = makeProvider();
  const contract = makeContract(provider);

  console.log('[listener/opened] listening Opened…');

  contract.on('Opened', async (...args) => {
    try {
      const event = args[args.length - 1];
      const { txHash, blockNum } = extractTxMeta(event);
      const key = `opened:${txHash}`;

      if (cache.has(key)) return; // déjà traité
      cache.add(key);

      const [id, state, asset, longSide, lots, entryOrTargetX6, slX6 = 0, tpX6 = 0, liqX6 = 0] = args;

      await upsertOpened({
        id: Number(id),
        owner_addr: '0x',
        asset_id: Number(asset),
        long_side: Boolean(longSide),
        lots: Number(lots),
        leverage_x: null,
        margin_usd6: 0,
        state: Number(state) === 0 ? 'ORDER' : 'OPEN',
        entry_x6: Number(state) === 1 ? BigInt(entryOrTargetX6).toString() : 0,
        target_x6: Number(state) === 0 ? BigInt(entryOrTargetX6).toString() : 0,
        sl_x6: slX6 ? BigInt(slX6).toString() : 0,
        tp_x6: tpX6 ? BigInt(tpX6).toString() : 0,
        liq_x6: liqX6 ? BigInt(liqX6).toString() : 0,
        tx_hash: txHash,
        block_num: blockNum
      });

      console.log('[Opened]', { id: Number(id), txHash });
    } catch (e) {
      console.error('[listener/opened] handler error', e);
    }
  });
};

main().catch(console.error);
