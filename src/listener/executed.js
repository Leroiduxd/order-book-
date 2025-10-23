import { makeProvider, makeContract, extractTxMeta } from '../lib/provider.js';
import { markExecuted } from '../lib/supabase.js';

const main = async () => {
  const provider = makeProvider();
  const contract = makeContract(provider);

  console.log('[listener/executed] listening Executed…');

  contract.on('Executed', async (...args) => {
    try {
      const event = args[args.length - 1];
      const { txHash, blockNum } = extractTxMeta(event);
      const [id, entryX6] = args;

      await markExecuted({
        id: Number(id),
        entry_x6: BigInt(entryX6).toString(),
        tx_hash: txHash,
        block_num: blockNum
      });

      console.log('[Executed]', { id: Number(id), entryX6: entryX6.toString(), txHash });
    } catch (e) {
      console.error('[listener/executed] handler error', e);
    }
  });

  provider._websocket?.on?.('close', (code) => {
    console.error('[listener/executed] WS closed', code);
    process.exit(1);
  });
};

main().catch((e) => {
  console.error('[listener/executed] fatal', e);
  process.exit(1);
});
