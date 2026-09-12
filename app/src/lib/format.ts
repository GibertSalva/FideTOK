import { USDC_UNIT } from "./config";

const usd = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("es-AR");
const usdc = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Unidades base de USDC (6 decimales) a numero, sin unidad.
 * El tablero pone "USDC" en el label y la cifra sola en grande.
 */
export function formatUsdcAmount(base: bigint | number) {
  return usdc.format(Number(base) / Number(USDC_UNIT));
}

/** Unidades base de USDC (6 decimales) a texto con unidad. */
export function formatUsdc(base: bigint | number) {
  return `USDC ${formatUsdcAmount(base)}`;
}

/**
 * Unidades base de USDC con simbolo de peso: la cifra grande del tablero.
 * Arriba de 10.000 se redondea, porque los centavos no entran en la celda ni aportan.
 */
export function formatUsdcMoney(base: bigint | number) {
  const value = Number(base) / Number(USDC_UNIT);
  return Math.abs(value) >= 10_000 ? `$${int.format(Math.round(value))}` : `$${usdc.format(value)}`;
}

/** Monto en dolares con simbolo y sin centavos, para totales grandes. */
export function formatMoney(value: number) {
  return `$${int.format(Math.round(value))}`;
}

export function formatUsd(value: number) {
  return usd.format(value);
}

export function formatArs(value: number) {
  return ars.format(value);
}

export function formatInt(value: bigint | number) {
  return int.format(value);
}

export function usdcToBase(value: number) {
  return BigInt(Math.round(value * Number(USDC_UNIT)));
}

export function shortAddress(value: string, size = 4) {
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

export function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string) {
  const clean = hex.replace(/^0x/, "");
  return Uint8Array.from(clean.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16));
}
