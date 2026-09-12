import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

export const PUBLIC_FIELDS =
  "id, asset_type, nombre, simbolo, descripcion, detalle_activo, valuacion_usd, cuit_fideicomiso, registro, precio_usdc, cantidad, mint, contrato_sha256, emision_tx, created_at";

/** Fideicomisos emitidos (datos publicos). El estado vivo (vendidos, NAV) se lee on-chain en el cliente. */
export const GET = handle(async () => {
  const data = assertOk(
    await db().from("solicitudes").select(PUBLIC_FIELDS).eq("status", "emitida").order("created_at", { ascending: false }),
  );
  return NextResponse.json(data);
});
