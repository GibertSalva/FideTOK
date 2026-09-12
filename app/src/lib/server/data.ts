import { HttpError } from "./http";
import { db } from "./supabase";

export async function ensureProfile(wallet: string, rol: "inversor" | "originador") {
  const { error } = await db().from("profiles").upsert({ wallet, rol }, { onConflict: "wallet", ignoreDuplicates: true });
  if (error) throw new HttpError(500, error.message);
}

export function assertOk<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new HttpError(500, result.error.message);
  return result.data;
}

export function requireText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `Falta ${field}`);
  if (value.length > max) throw new HttpError(400, `${field} es demasiado largo`);
  return value.trim();
}

export function requireNumber(value: unknown, field: string): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number <= 0) throw new HttpError(400, `${field} invalido`);
  return number;
}

/** Los archivos subidos tienen que estar en la carpeta de la wallet que los subio. */
export function requireOwnPath(value: unknown, wallet: string, field: string): string {
  const path = requireText(value, field, 300);
  if (!path.startsWith(`${wallet}/`)) throw new HttpError(400, `${field} invalido`);
  return path;
}
