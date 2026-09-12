import type { AssetKey } from "./config";

/** Datos publicos de un fideicomiso emitido (lo que devuelve /api/fideicomisos). */
export type FideicomisoPublico = {
  id: string;
  asset_type: AssetKey;
  nombre: string;
  simbolo: string;
  descripcion: string | null;
  detalle_activo: Record<string, string>;
  valuacion_usd: number;
  cuit_fideicomiso: string;
  registro: string;
  precio_usdc: number;
  cantidad: number;
  mint: string;
  contrato_sha256: string;
  emision_tx: string | null;
  created_at: string;
};

export const DETALLE_LABELS: Record<string, string> = {
  direccion: "Dirección",
  superficie_m2: "Superficie (m²)",
  renta_mensual_ars: "Alquiler mensual (ARS)",
  ubicacion: "Ubicación",
  hectareas: "Hectáreas",
  actividad: "Actividad",
  deudor_cedido: "Deudor cedido",
  valor_nominal_usd: "Valor nominal (USD)",
  vencimiento: "Vencimiento",
  detalle: "Detalle",
};
