import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, requireAdmin } from "@/lib/server/http";
import { BUCKET_CONTRATOS, db } from "@/lib/server/supabase";

/** Todas las solicitudes, con un link temporal (10 min) al contrato para auditarlo. */
export const GET = handle(async () => {
  await requireAdmin();
  const rows = assertOk(await db().from("solicitudes").select("*").order("created_at", { ascending: false })) ?? [];
  const withUrls = await Promise.all(
    rows.map(async (row) => {
      const { data } = await db().storage.from(BUCKET_CONTRATOS).createSignedUrl(row.contrato_path, 600);
      return { ...row, contrato_url: data?.signedUrl ?? null };
    }),
  );
  return NextResponse.json(withUrls);
});
