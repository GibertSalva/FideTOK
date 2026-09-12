import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, requireAdmin } from "@/lib/server/http";
import { BUCKET_KYC, db } from "@/lib/server/supabase";

async function signed(path: string | null) {
  if (!path) return null;
  const { data } = await db().storage.from(BUCKET_KYC).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

/** KYCs para revisar, con links temporales a la documentacion (solo el fiduciario). */
export const GET = handle(async () => {
  await requireAdmin();
  const rows =
    assertOk(
      await db()
        .from("kyc")
        .select("wallet, nombre, apellido, dni, cuit, nacionalidad, residente_ar, origen_fondos, risk_flags, status, commitment, whitelist_tx, created_at, reviewed_at, dni_frente_path, dni_dorso_path, selfie_path")
        .order("created_at", { ascending: false }),
    ) ?? [];
  const withDocs = await Promise.all(
    rows.map(async ({ dni_frente_path, dni_dorso_path, selfie_path, ...row }) => ({
      ...row,
      docs: {
        dni_frente: await signed(dni_frente_path),
        dni_dorso: await signed(dni_dorso_path),
        selfie: await signed(selfie_path),
      },
    })),
  );
  return NextResponse.json(withDocs);
});
