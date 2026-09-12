"use client";

import { useSession } from "@/components/providers";

/**
 * Tres roles, como los define el backend:
 *  - fiduciante   profiles.rol = 'originador'  · presenta el legajo del bien
 *  - administrador session.isAdmin             · aprueba, emite, habilita y liquida
 *  - inversor     profiles.rol = 'inversor'    · se habilita, suscribe y cobra renta
 * Una wallet recien conectada todavia no tiene perfil: el rol se define cuando
 * presenta su primer legajo (originador) o su primer KYC (inversor).
 */
export type Rol = "administrador" | "fiduciante" | "inversor";

export const ROL_LABEL: Record<Rol, string> = {
  administrador: "Administrador",
  fiduciante: "Fiduciante",
  inversor: "Inversor",
};

/** Cada rol entra a la pantalla donde realmente trabaja. */
export const ROL_HOME: Record<Rol, string> = {
  administrador: "/admin",
  fiduciante: "/originador",
  inversor: "/mercado",
};

export function useRol(): { rol: Rol | null; loading: boolean; haySesion: boolean } {
  const { me, loading } = useSession();
  if (loading || !me) return { rol: null, loading: true, haySesion: false };
  if (!me.session) return { rol: null, loading: false, haySesion: false };
  if (me.session.isAdmin) return { rol: "administrador", loading: false, haySesion: true };
  if (me.profile?.rol === "originador") return { rol: "fiduciante", loading: false, haySesion: true };
  if (me.profile?.rol === "inversor") return { rol: "inversor", loading: false, haySesion: true };
  // Con sesion pero sin perfil: todavia no eligio por donde entrar.
  return { rol: null, loading: false, haySesion: true };
}

/** Pastilla del rol: el administrador se destaca, el resto acompaña. */
export function roleChip(rol: Rol) {
  const base = "items-center rounded-pill px-3 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em]";
  if (rol === "administrador") return `${base} bg-acid/15 text-acid`;
  if (rol === "fiduciante") return `${base} bg-up/12 text-up`;
  return `${base} bg-surface-2 text-bone`;
}
