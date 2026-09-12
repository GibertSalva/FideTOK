// Demo del cerrojo CNV: intenta sacar certificados hacia una wallet sin KYC (p. ej. un exchange).
// Uso: pnpm attack <MINT> [--send]
// La wallet de SOLANA_WALLET_PATH tiene que tener certificados de ese mint.
// Sin --send simula; con --send la manda igual (skipPreflight) para verla fallar en el Explorer.
import { address, generateKeyPairSigner } from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";

import { createFideTokClient } from "../client.js";
import { getTransferCpInstruction } from "../lib/fidetok.js";
import { explorerTx, sendSkipPreflight, simulate } from "../lib/send.js";

async function main() {
  const mintArg = process.argv[2];
  if (!mintArg) throw new Error("Uso: pnpm attack <MINT> [--send]");
  const mint = address(mintArg);
  const client = await createFideTokClient();

  // Destino: una wallet nueva, sin KYC en FideTOK.
  const outsider = (await generateKeyPairSigner()).address;
  const [outsiderAta] = await findAssociatedTokenPda({ owner: outsider, mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
  const instructions = [
    getCreateAssociatedTokenIdempotentInstruction({
      payer: client.payer,
      owner: outsider,
      mint,
      ata: outsiderAta,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    }),
    await getTransferCpInstruction({ mint, owner: client.payer, destinationOwner: outsider, amount: 1 }),
  ];

  console.log(`Intentando transferir 1 certificado de ${client.payer.address} a ${outsider} (sin KYC)...\n`);
  const { err, logs } = await simulate(client, instructions);
  console.log(logs.join("\n"));
  if (!err) {
    console.log("\nLa transferencia paso: revisar la whitelist.");
    process.exitCode = 1;
    return;
  }
  console.log("\nRechazada por la red: el certificado no puede salir del entorno privado (CNV).");

  if (process.argv.includes("--send")) {
    const signature = await sendSkipPreflight(client, instructions);
    console.log(`Enviada igual para dejar evidencia on-chain: ${explorerTx(signature)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
