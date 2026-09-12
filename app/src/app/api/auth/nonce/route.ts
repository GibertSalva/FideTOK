import { isAddress } from "@solana/kit";
import { NextResponse } from "next/server";

import { handle, HttpError } from "@/lib/server/http";
import { signToken } from "@/lib/server/session";

/** Paso 1 del login: devuelve el mensaje a firmar y un challenge firmado (5 minutos). */
export const POST = handle(async (request: Request) => {
  const { wallet } = (await request.json()) as { wallet?: string };
  if (!wallet || !isAddress(wallet)) throw new HttpError(400, "Wallet invalida");

  const message = [
    "FideTOK: iniciar sesion",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${crypto.randomUUID()}`,
    `Fecha: ${new Date().toISOString()}`,
    "",
    "Firmar este mensaje no mueve fondos ni autoriza transacciones.",
  ].join("\n");
  const challenge = await signToken({ wallet, message }, "5m");
  return NextResponse.json({ message, challenge });
});
