import { createSolanaRpc } from "@solana/kit";

/** RPC del servidor (Triton) para verificar on-chain lo que informa el cliente. */
export function serverRpc() {
  return createSolanaRpc(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com");
}
