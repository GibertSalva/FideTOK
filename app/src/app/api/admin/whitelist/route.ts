import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, requireAdmin } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

/**
 * Wallets habilitadas para tener certificados. El transfer hook exige whitelist en
 * cada transferencia, asi que este conjunto contiene a todos los tenedores posibles:
 * alcanza para resolver quien cobra una distribucion sin escanear la cadena entera.
 */
export const GET = handle(async () => {
  await requireAdmin();
  const rows = assertOk(await db().from("kyc").select("wallet").eq("status", "aprobado")) ?? [];
  return NextResponse.json({ wallets: rows.map((row) => row.wallet as string) });
});
