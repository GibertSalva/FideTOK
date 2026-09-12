import { assertOk } from "@/lib/server/data";
import { handle, HttpError, requireAdmin } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Reporte fiscal de una distribucion (Flujo 5, AFIP): quien cobro cuanto, en USDC y en pesos,
 * con el tipo de cambio declarado on-chain y la firma de cada pago.
 */
export const GET = handle(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await context.params;
  const distribucion = assertOk(await db().from("distribuciones").select("*").eq("id", id).maybeSingle());
  if (!distribucion) throw new HttpError(404, "Distribucion inexistente");

  const [fideicomiso, pagos] = await Promise.all([
    db().from("solicitudes").select("nombre, cuit_fideicomiso").eq("mint", distribucion.mint).maybeSingle(),
    db().from("pagos").select("*").eq("distribucion_id", id).order("usdc", { ascending: false }),
  ]);
  const rows = assertOk(pagos) ?? [];
  const kycs = rows.length
    ? assertOk(await db().from("kyc").select("wallet, nombre, apellido, cuit, dni, residente_ar").in("wallet", rows.map((p) => p.wallet))) ?? []
    : [];
  const byWallet = new Map(kycs.map((k) => [k.wallet, k]));

  const header = [
    "fecha_distribucion",
    "fideicomiso",
    "cuit_fideicomiso",
    "beneficiario",
    "cuit_cuil",
    "dni",
    "residencia",
    "wallet",
    "certificados",
    "participacion_pct",
    "monto_usdc",
    "tipo_cambio_ars_usd",
    "fuente_tipo_cambio",
    "monto_ars",
    "firma_pago",
  ];
  const lines = rows.map((p) => {
    const k = byWallet.get(p.wallet);
    return [
      distribucion.fx_timestamp,
      fideicomiso.data?.nombre ?? distribucion.mint,
      fideicomiso.data?.cuit_fideicomiso ?? "",
      k ? `${k.apellido}, ${k.nombre}` : "Pool de liquidez (plataforma)",
      k?.cuit ?? "",
      k?.dni ?? "",
      k ? (k.residente_ar ? "Argentina" : "Exterior") : "",
      p.wallet,
      p.tokens,
      Number(p.porcentaje).toFixed(4),
      Number(p.usdc).toFixed(6),
      Number(distribucion.ars_por_usd).toFixed(4),
      distribucion.fx_source,
      Number(p.ars).toFixed(2),
      p.tx,
    ]
      .map(csvCell)
      .join(",");
  });

  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fidetok-distribucion-${distribucion.indice}.csv"`,
    },
  });
});
