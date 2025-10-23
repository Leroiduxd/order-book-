import { makeProvider, makeContract, extractTxMeta } from '../lib/provider.js';
import { markRemoved } from '../lib/supabase.js';

const main = async () => {
  const provider = makeProvider();
  const contract = makeContract(provider);

  console.log('[listener/removed] listening Removed…');

  contract.on('Removed', async (...args) => {
    try {
      const event = args[args.length - 1];
      const { txHash, blockNum } = extractTxMeta(event);
      const [id, reason, execX6, pnlUsd6] = args;

      await markRemoved({
        id: Number(id),
        reason: Number(reason),
        exec_x6: execX6 ? BigInt(execX6).toString() : '0',
        pnl_usd6: pnlUsd6?.toString?.() ?? '0',
        tx_hash: txHash,
        block_num: blockNum
      });

      console.log('[Removed]', { id: Number(id), reason: Number(reason), txHash });
    } catch (e) {
      console.error('[listener/removed] handler error', e);
    }
  });

  provider._websocket?.on?.('close', (code) => {
    console.error('[listener/removed] WS closed', code);
    process.exit(1);
  });
};

main().catch((e) => {
  console.error('[listener/removed] fatal', e);
  process.exit(1);
});
