import { NextResponse } from "next/server";

import { APP_URL, ASSET_LABELS, type AssetKey } from "@/lib/config";
import { assertOk } from "@/lib/server/data";
import { handle, HttpError } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

/** JSON de metadata del token (la URI grabada en el mint Token-2022). */
export const GET = handle(async (_request: Request, context: { params: Promise<{ mint: string }> }) => {
  const { mint } = await context.params;
  const solicitud = assertOk(
    await db()
      .from("solicitudes")
      .select("nombre, simbolo, descripcion, asset_type, cuit_fideicomiso, registro, valuacion_usd, contrato_sha256")
      .eq("mint", mint)
      .maybeSingle(),
  );
  if (!solicitud) throw new HttpError(404, "Fideicomiso no encontrado");

  return NextResponse.json({
    name: solicitud.nombre,
    symbol: solicitud.simbolo,
    description:
      solicitud.descripcion ??
      `Certificado de participacion del fideicomiso ${solicitud.nombre}. Solo transferible entre inversores con KYC en FideTOK.`,
    external_url: `${APP_URL}/mercado/${mint}`,
    attributes: [
      { trait_type: "Tipo de activo", value: ASSET_LABELS[solicitud.asset_type as AssetKey] ?? solicitud.asset_type },
      { trait_type: "CUIT del fideicomiso", value: solicitud.cuit_fideicomiso },
      { trait_type: "Registro", value: solicitud.registro },
      { trait_type: "Valuacion USD", value: solicitud.valuacion_usd },
      { trait_type: "Contrato sha256", value: solicitud.contrato_sha256 },
    ],
  });
});
