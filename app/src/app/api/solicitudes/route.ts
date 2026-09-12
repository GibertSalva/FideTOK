import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { assertOk, ensureProfile, requireNumber, requireOwnPath, requireText } from "@/lib/server/data";
import { handle, HttpError, requireSession } from "@/lib/server/http";
import { BUCKET_CONTRATOS, db } from "@/lib/server/supabase";

const ASSET_TYPES = ["inmueble", "rural", "creditos", "otro"];

/** Flujo 1: el originador pide tokenizar un activo. Sin contrato firmado no hay solicitud. */
export const POST = handle(async (request: Request) => {
  const session = await requireSession();
  const body = (await request.json()) as Record<string, unknown>;

  const assetType = requireText(body.asset_type, "tipo de activo", 20);
  if (!ASSET_TYPES.includes(assetType)) throw new HttpError(400, "Tipo de activo invalido");
  const contratoPath = requireOwnPath(body.contrato_path, session.wallet, "contrato");
  const contratoSha256 = requireText(body.contrato_sha256, "hash del contrato", 64).toLowerCase();

  // El hash lo recalcula el servidor sobre el archivo subido: es el que despues se graba on-chain.
  const file = assertOk(await db().storage.from(BUCKET_CONTRATOS).download(contratoPath));
  if (!file) throw new HttpError(400, "No encontramos el contrato subido");
  const serverHash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  if (serverHash !== contratoSha256) throw new HttpError(400, "El hash del contrato no coincide con el archivo subido");

  await ensureProfile(session.wallet, "originador");
  const solicitud = assertOk(
    await db()
      .from("solicitudes")
      .insert({
        originador_wallet: session.wallet,
        asset_type: assetType,
        nombre: requireText(body.nombre, "nombre", 32),
        simbolo: requireText(body.simbolo, "simbolo", 10).toUpperCase(),
        descripcion: typeof body.descripcion === "string" ? body.descripcion.slice(0, 1000) : null,
        detalle_activo: typeof body.detalle_activo === "object" && body.detalle_activo ? body.detalle_activo : {},
        valuacion_usd: Math.round(requireNumber(body.valuacion_usd, "valuacion")),
        cuit_fideicomiso: requireText(body.cuit_fideicomiso, "CUIT del fideicomiso", 13),
        registro: typeof body.registro === "string" ? body.registro.slice(0, 64) : "",
        precio_usdc: requireNumber(body.precio_usdc, "precio"),
        cantidad: Math.round(requireNumber(body.cantidad, "cantidad de certificados")),
        contrato_path: contratoPath,
        contrato_sha256: serverHash,
      })
      .select("id, status")
      .single(),
  );
  return NextResponse.json(solicitud);
});

/** Solicitudes propias del originador. */
export const GET = handle(async () => {
  const session = await requireSession();
  const data = assertOk(
    await db()
      .from("solicitudes")
      .select("id, nombre, simbolo, asset_type, status, mint, emision_tx, created_at")
      .eq("originador_wallet", session.wallet)
      .order("created_at", { ascending: false }),
  );
  return NextResponse.json(data);
});
