import { NextResponse } from "next/server";

import { assertOk, requireText } from "@/lib/server/data";
import { handle, requireAdmin } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  assertOk(await db().from("distribuciones").update({ close_tx: requireText(body.close_tx, "firma", 100) }).eq("id", id));
  return NextResponse.json({ ok: true });
});
