import { NextResponse } from "next/server";

import { assertOk, requireNumber, requireText } from "@/lib/server/data";
import { handle, HttpError, requireAdmin } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

export const GET = handle(async () => {
  await requireAdmin();
  const data = assertOk(
    await db().from("distribuciones").select("*, pagos(count)").order("created_at", { ascending: false }),
  );
  return NextResponse.json(data ?? []);
});

/** Registra una distribucion iniciada on-chain (Flujo 5). */
export const POST = handle(async (request: Request) => {
  await requireAdmin();
  const body = (await request.json()) as Record<string, unknown>;
  const indice = Number(body.indice);
  if (!Number.isInteger(indice) || indice < 0) throw new HttpError(400, "Indice invalido");
  const created = assertOk(
    await db()
      .from("distribuciones")
      .insert({
        mint: requireText(body.mint, "mint", 44),
        indice,
        distribution_address: requireText(body.distribution_address, "cuenta de la distribucion", 44),
        total_usdc: requireNumber(body.total_usdc, "total"),
        ars_por_usd: requireNumber(body.ars_por_usd, "tipo de cambio"),
        fx_source: requireText(body.fx_source, "fuente", 60),
        fx_timestamp: requireText(body.fx_timestamp, "fecha del tipo de cambio", 40),
        start_tx: requireText(body.start_tx, "firma", 100),
      })
      .select("id")
      .single(),
  );
  return NextResponse.json(created);
});
