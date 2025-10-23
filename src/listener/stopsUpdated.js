import { makeProvider, makeContract, extractTxMeta } from '../lib/provider.js';
import { supa, updateStops } from '../lib/supabase.js';
import { EventCache } from '../lib/cache.js';

const cache = new EventCache();

const main = async () => {
  const provider = makeProvider();
  const contract = makeContract(provider);

  console.log('[listener/stops] listening StopsUpdated…');

  contract.on('StopsUpdated', async (...args) => {
    try {
      const event = args[args.length - 1];
      const { txHash, blockNum } = extractTxMeta(event);
      const key = `stops:${txHash}`;
      if (cache.has(key)) return;
      cache.add(key);

      const [id, slX6, tpX6] = args;

      const { data, error } = await supa.from('trades').select('asset_id').eq('id', Number(id)).single();
      if (error) throw error;

      await updateStops({
        id: Number(id),
        sl_x6: slX6 ? BigInt(slX6).toString() : 0,
        tp_x6: tpX6 ? BigInt(tpX6).toString() : 0,
        asset_id: data.asset_id,
        tx_hash: txHash,
        block_num: blockNum
      });

      console.log('[StopsUpdated]', { id: Number(id), txHash });
    } catch (e) {
      console.error('[listener/stops] handler error', e);
    }
  });
};

main().catch(console.error);
