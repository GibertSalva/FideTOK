import { NextResponse } from "next/server";

import { handle, HttpError } from "@/lib/server/http";

/** Tipo de cambio oficial para precargar la distribucion (el fiduciario lo confirma y queda on-chain). */
export const GET = handle(async () => {
  const response = await fetch("https://dolarapi.com/v1/dolares/oficial", { next: { revalidate: 600 } });
  if (!response.ok) throw new HttpError(502, "No se pudo obtener el tipo de cambio");
  const data = (await response.json()) as { compra: number; venta: number; fechaActualizacion: string };
  return NextResponse.json({
    compra: data.compra,
    venta: data.venta,
    fecha: data.fechaActualizacion,
    fuente: "Dólar oficial (dolarapi.com)",
  });
});
