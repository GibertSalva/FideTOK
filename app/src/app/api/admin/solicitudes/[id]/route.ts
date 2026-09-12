import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, HttpError, requireAdmin } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

/** Auditoria de documentos: aprobar (queda lista para emitir) o rechazar. */
export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await context.params;
  const { action } = (await request.json()) as { action?: string };
  if (action !== "aprobar" && action !== "rechazar") throw new HttpError(400, "Accion invalida");

  const row = assertOk(await db().from("solicitudes").select("status").eq("id", id).maybeSingle());
  if (!row) throw new HttpError(404, "Solicitud inexistente");
  if (row.status !== "pendiente_auditoria") throw new HttpError(409, "La solicitud ya fue auditada");

  assertOk(
    await db()
      .from("solicitudes")
      .update({ status: action === "aprobar" ? "aprobada" : "rechazada", reviewed_at: new Date().toISOString() })
      .eq("id", id),
  );
  return NextResponse.json({ ok: true });
});
