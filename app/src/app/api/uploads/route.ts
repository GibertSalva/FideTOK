import { NextResponse } from "next/server";

import { assertOk } from "@/lib/server/data";
import { handle, HttpError, requireSession } from "@/lib/server/http";
import { BUCKET_CONTRATOS, BUCKET_KYC, db } from "@/lib/server/supabase";

const RULES = {
  [BUCKET_CONTRATOS]: { types: ["application/pdf"] },
  [BUCKET_KYC]: { types: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
} as const;

/**
 * Devuelve una URL firmada para subir el archivo directo del browser a Supabase Storage
 * (los buckets son privados y las funciones de Vercel cortan a 4.5 MB por request).
 */
export const POST = handle(async (request: Request) => {
  const session = await requireSession();
  const { bucket, kind, contentType } = (await request.json()) as { bucket?: string; kind?: string; contentType?: string };
  if (bucket !== BUCKET_CONTRATOS && bucket !== BUCKET_KYC) throw new HttpError(400, "Bucket invalido");
  if (!contentType || !(RULES[bucket].types as readonly string[]).includes(contentType)) {
    throw new HttpError(400, "Tipo de archivo no permitido");
  }
  const safeKind = (kind ?? "archivo").replace(/[^a-z_]/gi, "").slice(0, 20) || "archivo";
  const extension = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1];
  const path = `${session.wallet}/${safeKind}-${crypto.randomUUID()}.${extension}`;

  const data = assertOk(await db().storage.from(bucket).createSignedUploadUrl(path));
  if (!data) throw new HttpError(500, "No se pudo preparar la subida");
  return NextResponse.json({ path, signedUrl: data.signedUrl });
});
