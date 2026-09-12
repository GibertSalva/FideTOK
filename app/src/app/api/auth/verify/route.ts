import { address, getPublicKeyFromAddress, verifySignature, type SignatureBytes } from "@solana/kit";
import { NextResponse } from "next/server";

import { handle, HttpError } from "@/lib/server/http";
import { isAdminWallet, setSession, verifyToken } from "@/lib/server/session";

/** Paso 2 del login: verifica la firma ed25519 del mensaje y abre la sesion. */
export const POST = handle(async (request: Request) => {
  const { challenge, signature } = (await request.json()) as { challenge?: string; signature?: string };
  if (!challenge || !signature) throw new HttpError(400, "Faltan datos");

  const payload = await verifyToken<{ wallet: string; message: string }>(challenge);
  if (!payload) throw new HttpError(401, "El desafio vencio, volve a intentar");

  const publicKey = await getPublicKeyFromAddress(address(payload.wallet));
  const signatureBytes = Uint8Array.from(Buffer.from(signature, "base64")) as unknown as SignatureBytes;
  const valid = await verifySignature(publicKey, signatureBytes, new TextEncoder().encode(payload.message));
  if (!valid) throw new HttpError(401, "Firma invalida");

  await setSession(payload.wallet);
  return NextResponse.json({ wallet: payload.wallet, isAdmin: isAdminWallet(payload.wallet) });
});
