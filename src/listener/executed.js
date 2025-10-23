import { makeProvider, makeContract, extractTxMeta } from '../lib/provider.js';
import { markExecuted } from '../lib/supabase.js';
import { EventCache } from '../lib/cache.js';

const cache = new EventCache();

const main = async () => {
  const provider = makeProvider();
  const contract = makeContract(provider);

  console.log('[listener/executed] listening Executed…');

  contract.on('Executed', async (...args) => {
    try {
      const event = args[args.length - 1];
      const { txHash, blockNum } = extractTxMeta(event);
      const key = `executed:${txHash}`;
      if (cache.has(key)) return;
      cache.add(key);

      const [id, entryX6] = args;

      await markExecuted({
        id: Number(id),
        entry_x6: BigInt(entryX6).toString(),
        tx_hash: txHash,
        block_num: blockNum
      });

      console.log('[Executed]', { id: Number(id), txHash });
    } catch (e) {
      console.error('[listener/executed] handler error', e);
    }
  });
};

main().catch(console.error);
