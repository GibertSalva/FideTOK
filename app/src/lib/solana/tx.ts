import type { Instruction } from "@solana/kit";

import type { FideTokClient } from "./client";

/**
 * Firma con la wallet conectada, envia y confirma. El plugin de RPC estima los compute units,
 * simula antes de enviar y maneja blockhash y reintentos.
 */
export async function sendTx(client: FideTokClient, instructions: Instruction[]): Promise<string> {
  const result = await client.sendTransaction(instructions);
  return result.context.signature;
}

/** Signer de la wallet conectada (falla si no hay wallet). */
export function walletSigner(client: FideTokClient) {
  const connected = client.wallet.getState().connected;
  if (!connected) throw new Error("Conecta tu wallet");
  return connected.signer;
}
