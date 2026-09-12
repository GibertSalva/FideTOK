import { NextResponse } from "next/server";

import { getSession, type Session } from "./session";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Envuelve un route handler: convierte HttpError y errores inesperados en JSON. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.message);
      // Variables de entorno faltantes: mensaje claro en vez de un 500 generico.
      if (error instanceof Error && error.message.startsWith("Falta")) return fail(503, error.message);
      console.error(error);
      return fail(500, "Error interno");
    }
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Inicia sesion con tu wallet");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!session.isAdmin) throw new HttpError(403, "Solo el fiduciario");
  return session;
}
