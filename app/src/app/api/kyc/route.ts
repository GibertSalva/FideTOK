import { NextResponse } from "next/server";

import { assertOk, ensureProfile, requireOwnPath, requireText } from "@/lib/server/data";
import { handle, HttpError, requireSession } from "@/lib/server/http";
import { evaluateRisk } from "@/lib/server/kyc";
import { db } from "@/lib/server/supabase";

const ORIGENES = ["salario", "ahorros", "actividad_comercial", "venta_bienes", "herencia", "otros"];

/** Flujo 2: el inversor envia su KYC. Queda pendiente hasta que el fiduciario lo apruebe. */
export const POST = handle(async (request: Request) => {
  const session = await requireSession();
  const body = (await request.json()) as Record<string, unknown>;

  const dni = requireText(body.dni, "DNI", 12).replace(/\D/g, "");
  const cuit = requireText(body.cuit, "CUIT/CUIL", 13).replace(/\D/g, "");
  const origenFondos = requireText(body.origen_fondos, "origen de fondos", 40);
  if (!ORIGENES.includes(origenFondos)) throw new HttpError(400, "Origen de fondos invalido");
  const residenteAr = body.residente_ar === true;

  const riskFlags = evaluateRisk({ dni, cuit, residenteAr, origenFondos });
  await ensureProfile(session.wallet, "inversor");

  const existing = assertOk(await db().from("kyc").select("status").eq("wallet", session.wallet).maybeSingle());
  if (existing?.status === "aprobado") throw new HttpError(409, "Tu KYC ya esta aprobado");

  assertOk(
    await db()
      .from("kyc")
      .upsert({
        wallet: session.wallet,
        nombre: requireText(body.nombre, "nombre", 80),
        apellido: requireText(body.apellido, "apellido", 80),
        dni,
        cuit,
        nacionalidad: requireText(body.nacionalidad, "nacionalidad", 60),
        residente_ar: residenteAr,
        origen_fondos: origenFondos,
        dni_frente_path: requireOwnPath(body.dni_frente_path, session.wallet, "DNI frente"),
        dni_dorso_path: requireOwnPath(body.dni_dorso_path, session.wallet, "DNI dorso"),
        selfie_path: requireOwnPath(body.selfie_path, session.wallet, "selfie"),
        risk_flags: riskFlags,
        status: "pendiente",
        commitment: null,
        nonce: null,
        reviewed_at: null,
      }),
  );
  return NextResponse.json({ status: "pendiente", riskFlags });
});
