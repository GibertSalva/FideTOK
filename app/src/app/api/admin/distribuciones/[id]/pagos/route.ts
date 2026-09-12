import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, HttpError, requireAdmin } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

type Pago = { wallet: string; tokens: number; porcentaje: number; usdc: number; ars: number; tx: string };

/** Registra los pagos confirmados on-chain: es la base del reporte fiscal. */
export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await context.params;
  const { pagos } = (await request.json()) as { pagos?: Pago[] };
  if (!Array.isArray(pagos) || pagos.length === 0) throw new HttpError(400, "Sin pagos");
  assertOk(
    await db()
      .from("pagos")
      .upsert(
        pagos.map((p) => ({ distribucion_id: id, ...p })),
        { onConflict: "distribucion_id,wallet" },
      ),
  );
  return NextResponse.json({ ok: true });
});
