import { NextResponse } from "next/server";

import { assertOk, requireNumber, requireText } from "@/lib/server/data";
import { handle, requireAdmin } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

/** Historial del valor cuotaparte publicado (la fuente de verdad es la cuenta on-chain). */
export const POST = handle(async (request: Request) => {
  await requireAdmin();
  const body = (await request.json()) as Record<string, unknown>;
  assertOk(
    await db()
      .from("navs")
      .insert({
        mint: requireText(body.mint, "mint", 44),
        nav_usdc: requireNumber(body.nav_usdc, "NAV"),
        tx: requireText(body.tx, "firma", 100),
      }),
  );
  return NextResponse.json({ ok: true });
});
