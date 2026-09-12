import { api } from "./api";

const MAX_BYTES = 10 * 1024 * 1024;

/** Sube un archivo directo a Supabase Storage con una URL firmada que emite el servidor. */
export async function uploadFile(bucket: "kyc" | "contratos", kind: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} supera los 10 MB`);
  const { path, signedUrl } = await api<{ path: string; signedUrl: string }>("/api/uploads", {
    json: { bucket, kind, contentType: file.type },
  });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  const response = await fetch(signedUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!response.ok) throw new Error(`No se pudo subir ${file.name}`);
  return path;
}

export async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
