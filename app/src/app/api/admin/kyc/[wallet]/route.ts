import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, HttpError, requireAdmin } from "@/lib/server/http";
import { makeCommitment } from "@/lib/server/kyc";
import { db } from "@/lib/server/supabase";

/**
 * preparar: genera el commitment sha256(dni|cuit|nonce) que el fiduciario firma en add_to_whitelist.
 * rechazar: el KYC queda rechazado y el inversor puede volver a enviarlo.
 */
export const POST = handle(async (request: Request, context: { params: Promise<{ wallet: string }> }) => {
  await requireAdmin();
  const { wallet } = await context.params;
  const { action } = (await request.json()) as { action?: string };

  const row = assertOk(await db().from("kyc").select("status, dni, cuit, residente_ar").eq("wallet", wallet).maybeSingle());
  if (!row) throw new HttpError(404, "KYC inexistente");
  if (row.status !== "pendiente") throw new HttpError(409, "El KYC ya fue resuelto");

  if (action === "rechazar") {
    assertOk(await db().from("kyc").update({ status: "rechazado", reviewed_at: new Date().toISOString() }).eq("wallet", wallet));
    return NextResponse.json({ ok: true });
  }
  if (action !== "preparar") throw new HttpError(400, "Accion invalida");

  const { nonce, commitment } = makeCommitment(row.dni, row.cuit);
  assertOk(await db().from("kyc").update({ nonce, commitment }).eq("wallet", wallet));
  return NextResponse.json({ commitment, residency: row.residente_ar ? "argentina" : "extranjero" });
});
