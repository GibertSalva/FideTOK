import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";

import { serverRpc } from "./rpc";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envia una transaccion firmada por una key del servidor y confirma por polling
 * (en funciones serverless no conviene abrir un websocket).
 */
export async function sendFromServer(payer: KeyPairSigner, instructions: Instruction[]) {
  const rpc = serverRpc();
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const transaction = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(transaction);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: "base64" }).send();

  for (let attempt = 0; attempt < 30; attempt++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new Error("La transaccion fallo on-chain");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
    await sleep(1000);
  }
  throw new Error("No se confirmo la transaccion a tiempo");
}
