import 'dotenv/config';

export const CONFIG = {
  RPC_WSS_URL: process.env.RPC_WSS_URL,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
};

for (const [k, v] of Object.entries(CONFIG)) {
  if (!v) {
    console.error(`[CONFIG] Missing env ${k}`);
    process.exit(1);
  }
}
