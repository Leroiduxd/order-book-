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
      if (cache.has(key)) return;
      cache.add(key);

      // Nouvelle signature :
      // id, state, asset, longSide, lots, entryOrTargetX6, slX6, tpX6, liqX6, trader, leverageX
      const [
        id, state, asset, longSide, lots,
        entryOrTargetX6, slX6 = 0, tpX6 = 0, liqX6 = 0,
        trader, leverageX
      ] = args;

      const stateTxt = Number(state) === 0 ? 'ORDER' : 'OPEN';

      await upsertOpened({
        id: Number(id),
        owner_addr: String(trader).toLowerCase(),               // ✅ vrai trader
        asset_id: Number(asset),
        long_side: Boolean(longSide),
        lots: Number(lots),
        leverage_x: Number(leverageX),            // ✅ vrai levier
        // margin_usd6 sera recalculée côté supabase.js (on a besoin du lot de l’asset)
        state: stateTxt,
        entry_x6: stateTxt === 'OPEN'  ? BigInt(entryOrTargetX6).toString() : '0',
        target_x6: stateTxt === 'ORDER' ? BigInt(entryOrTargetX6).toString() : '0',
        sl_x6: slX6 ? BigInt(slX6).toString() : '0',
        tp_x6: tpX6 ? BigInt(tpX6).toString() : '0',
        liq_x6: liqX6 ? BigInt(liqX6).toString() : '0',
        last_tx_hash: txHash,
        last_block_num: blockNum
      });

      console.log('[Opened]', { id: Number(id), lev: Number(leverageX), trader: String(trader), txHash });
    } catch (e) {
      console.error('[listener/opened] handler error', e);
    }
  });

  provider._websocket?.on?.('close', (code) => {
    console.error('[listener/opened] WS closed', code);
    process.exit(1);
  });
};

main().catch((e) => {
  console.error('[listener/opened] fatal', e);
  process.exit(1);
});

