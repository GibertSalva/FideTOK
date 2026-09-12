import { fidetok } from "@fidetok/client";
import { address } from "@solana/kit";
import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, HttpError, requireAdmin } from "@/lib/server/http";
import { serverRpc } from "@/lib/server/rpc";
import { db } from "@/lib/server/supabase";

/** El KYC pasa a aprobado solo si la whitelist on-chain tiene el commitment que genero el servidor. */
export const POST = handle(async (request: Request, context: { params: Promise<{ wallet: string }> }) => {
  await requireAdmin();
  const { wallet } = await context.params;
  const { signature } = (await request.json()) as { signature?: string };
  if (!signature) throw new HttpError(400, "Falta la firma de la transaccion");

  const row = assertOk(await db().from("kyc").select("status, commitment").eq("wallet", wallet).maybeSingle());
  if (!row?.commitment) throw new HttpError(409, "Primero hay que preparar la aprobacion");

  const [pda] = await fidetok.findWhitelistEntryPda({ wallet: address(wallet) });
  const entry = await fidetok.fetchMaybeWhitelistEntry(serverRpc(), pda);
  if (!entry.exists || entry.data.revoked) throw new HttpError(400, "La wallet no esta en la whitelist on-chain");
  if (Buffer.from(entry.data.kycCommitment).toString("hex") !== row.commitment) {
    throw new HttpError(400, "El commitment on-chain no coincide");
  }

  assertOk(
    await db()
      .from("kyc")
      .update({ status: "aprobado", whitelist_tx: signature, reviewed_at: new Date().toISOString() })
      .eq("wallet", wallet),
  );
  return NextResponse.json({ ok: true });
});
