import { makeProvider, makeContract, extractTxMeta } from '../lib/provider.js';
import { upsertOpened } from '../lib/supabase.js';

const main = async () => {
  const provider = makeProvider();
  const contract = makeContract(provider);

  console.log('[listener/opened] listening Opened…');

  contract.on('Opened', async (...args) => {
    try {
      const event = args[args.length - 1];
      const { txHash, blockNum } = extractTxMeta(event);
      // support both ABI variants
      const [id, state, asset, longSide, lots, entryOrTargetX6, slX6, tpX6, liqX6] = args;

      await upsertOpened({
        id: Number(id),
        owner_addr: '0x',            // inconnu via event → gardé vide (backend peut l’enrichir via lecture on-chain si besoin)
        asset_id: Number(asset),
        long_side: Boolean(longSide),
        lots: Number(lots),
        leverage_x: null,            // pas dans l’event
        margin_usd6: 0,              // pas dans l’event
        state: Number(state) === 0 ? 'ORDER' : 'OPEN',
        entry_x6: Number(state) === 1 ? BigInt(entryOrTargetX6).toString() : 0,
        target_x6: Number(state) === 0 ? BigInt(entryOrTargetX6).toString() : 0,
        sl_x6: slX6 ? BigInt(slX6).toString() : 0,
        tp_x6: tpX6 ? BigInt(tpX6).toString() : 0,
        liq_x6: liqX6 ? BigInt(liqX6).toString() : 0,
        tx_hash: txHash,
        block_num: blockNum
      });

      console.log('[Opened]', { id: Number(id), state: Number(state), asset: Number(asset), txHash });
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
