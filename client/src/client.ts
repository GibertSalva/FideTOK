import "dotenv/config";
import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { payerFromFile } from "@solana/kit-plugin-signer";

const rpcUrl = process.env.SOLANA_RPC_URL;
const rpcSubscriptionsUrl = process.env.SOLANA_WS_URL;
const walletPath = process.env.SOLANA_WALLET_PATH ?? "~/.config/solana/id.json";

if (!rpcUrl) {
  throw new Error("SOLANA_RPC_URL no esta seteado. Copia .env.local.example a .env.local y completa tu endpoint de Triton.");
}

export async function createFideTokClient() {
  return createClient()
    .use(payerFromFile(walletPath))
    .use(solanaRpc({ rpcUrl: rpcUrl!, rpcSubscriptionsUrl }));
}
