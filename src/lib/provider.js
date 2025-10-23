import { WebSocketProvider, Contract } from 'ethers';
import { CONFIG } from '../config.js';
import { TRADES_ABI } from '../abi/tradesAbi.js';

export const makeProvider = () => new WebSocketProvider(CONFIG.RPC_WSS_URL);

export const makeContract = (provider) =>
  new Contract(CONFIG.CONTRACT_ADDRESS, TRADES_ABI, provider);

// helper: récup tx info depuis event (ethers v6)
export const extractTxMeta = (logLike) => {
  const txHash = logLike?.log?.transactionHash || logLike?.transactionHash;
  const blockNum = logLike?.log?.blockNumber || logLike?.blockNumber;
  return { txHash, blockNum };
};
