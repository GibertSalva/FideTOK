import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type Rpc,
  type RpcSubscriptions,
  type Signature,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type TransactionSigner,
} from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";

export type SendClient = {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  payer: TransactionSigner;
};

export function explorerTx(signature: Signature, cluster = "devnet") {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

async function buildSigned(client: SendClient, instructions: Instruction[], computeUnits: number) {
  const { value: latestBlockhash } = await client.rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(client.payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) =>
      appendTransactionMessageInstructions(
        [getSetComputeUnitLimitInstruction({ units: computeUnits }), ...instructions],
        m,
      ),
  );
  return signTransactionMessageWithSigners(message);
}

/** Simula, firma, envia y confirma. Devuelve la firma. */
export async function send(client: SendClient, instructions: Instruction[], computeUnits = 400_000) {
  const transaction = await buildSigned(client, instructions, computeUnits);
  assertIsTransactionWithBlockhashLifetime(transaction);
  const signature = getSignatureFromTransaction(transaction);
  await sendAndConfirmTransactionFactory(client)(transaction, { commitment: "confirmed" });
  return signature;
}

/** Envia sin simular ni esperar confirmacion (sirve para dejar en el Explorer una tx que falla). */
export async function sendSkipPreflight(client: SendClient, instructions: Instruction[], computeUnits = 400_000) {
  const transaction = await buildSigned(client, instructions, computeUnits);
  return client.rpc
    .sendTransaction(getBase64EncodedWireTransaction(transaction), { encoding: "base64", skipPreflight: true })
    .send();
}

/** Simula sin enviar: devuelve el error y los logs del programa. */
export async function simulate(client: SendClient, instructions: Instruction[], computeUnits = 400_000) {
  const transaction = await buildSigned(client, instructions, computeUnits);
  const { value } = await client.rpc
    .simulateTransaction(getBase64EncodedWireTransaction(transaction), {
      encoding: "base64",
      replaceRecentBlockhash: true,
      sigVerify: false,
    })
    .send();
  return { err: value.err, logs: value.logs ?? [] };
}
