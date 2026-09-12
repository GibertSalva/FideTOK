import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { address, createKeyPairSignerFromBytes, type Instruction } from "@solana/kit";
import { NextResponse } from "next/server";

import { usdcMint } from "@/lib/config";
import { handle, HttpError, requireSession } from "@/lib/server/http";
import { serverRpc } from "@/lib/server/rpc";
import { sendFromServer } from "@/lib/server/send";

const USDC_AMOUNT = 1_000n * 1_000_000n;
const MIN_SOL = 20_000_000n; // 0.02 SOL
const SOL_TOP_UP = 50_000_000n; // 0.05 SOL para fees
const COOLDOWN_MS = 10 * 60 * 1000;
const lastRequest = new Map<string, number>();

/**
 * Faucet de devnet: 1.000 USDC mock y, si hace falta, SOL para fees (el usuario nunca ve "necesitas SOL").
 * Firma una key dedicada, mint authority del USDC mock: nunca la del deployer ni la del fiduciario.
 */
export const POST = handle(async () => {
  const session = await requireSession();
  const raw = process.env.FAUCET_KEYPAIR;
  if (!raw) throw new HttpError(503, "Faucet no configurado (FAUCET_KEYPAIR)");
  const last = lastRequest.get(session.wallet) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) throw new HttpError(429, "Ya pediste fondos hace poco. Probá en unos minutos.");

  const faucet = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(raw) as number[]));
  const owner = address(session.wallet);
  const usdc = usdcMint();
  const [ata] = await findAssociatedTokenPda({ owner, mint: usdc, tokenProgram: TOKEN_PROGRAM_ADDRESS });

  const instructions: Instruction[] = [
    getCreateAssociatedTokenIdempotentInstruction({ payer: faucet, owner, mint: usdc, ata }),
    getMintToInstruction({ mint: usdc, token: ata, mintAuthority: faucet, amount: USDC_AMOUNT }),
  ];
  const { value: balance } = await serverRpc().getBalance(owner).send();
  const topUp = balance < MIN_SOL;
  if (topUp) instructions.push(getTransferSolInstruction({ source: faucet, destination: owner, amount: SOL_TOP_UP }));

  const signature = await sendFromServer(faucet, instructions);
  lastRequest.set(session.wallet, Date.now());
  return NextResponse.json({ signature, usdc: 1000, sol: topUp ? 0.05 : 0 });
});
