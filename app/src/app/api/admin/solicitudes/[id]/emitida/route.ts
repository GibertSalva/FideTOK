import { fidetok } from "@fidetok/client";
import { address } from "@solana/kit";
import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, HttpError, requireAdmin } from "@/lib/server/http";
import { serverRpc } from "@/lib/server/rpc";
import { db } from "@/lib/server/supabase";

/**
 * Despues de que el fiduciario firma la emision, el servidor lee la cuenta on-chain y la compara
 * con lo auditado (hash del contrato y cantidad) antes de marcarla como emitida.
 */
export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await context.params;
  const { mint, signature } = (await request.json()) as { mint?: string; signature?: string };
  if (!mint || !signature) throw new HttpError(400, "Faltan mint y firma");

  const row = assertOk(await db().from("solicitudes").select("status, contrato_sha256, cantidad").eq("id", id).maybeSingle());
  if (!row) throw new HttpError(404, "Solicitud inexistente");
  if (row.status !== "aprobada") throw new HttpError(409, "La solicitud no esta aprobada");

  const [pda] = await fidetok.findFideicomisoPda({ mint: address(mint) });
  const account = await fidetok.fetchMaybeFideicomiso(serverRpc(), pda);
  if (!account.exists) throw new HttpError(400, "El fideicomiso no existe on-chain");
  const onchainHash = Buffer.from(account.data.contractSha256).toString("hex");
  if (onchainHash !== row.contrato_sha256) throw new HttpError(400, "El hash on-chain no coincide con el contrato auditado");
  if (Number(account.data.maxSupply) !== Number(row.cantidad)) throw new HttpError(400, "La cantidad on-chain no coincide");

  assertOk(
    await db()
      .from("solicitudes")
      .update({ status: "emitida", mint, emision_tx: signature, reviewed_at: new Date().toISOString() })
      .eq("id", id),
  );
  return NextResponse.json({ ok: true });
});
