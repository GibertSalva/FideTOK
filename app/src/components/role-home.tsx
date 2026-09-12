"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { ROL_HOME, useRol } from "@/components/roles";

/**
 * La portada es el elector de rol: solo la ve quien todavia no tiene uno.
 * Con el rol ya definido, cada wallet entra directo a la pantalla donde opera.
 */
export function RoleHome({ children }: { children: ReactNode }) {
  const { rol, loading } = useRol();
  const router = useRouter();

  useEffect(() => {
    if (rol) router.replace(ROL_HOME[rol]);
  }, [rol, router]);

  if (loading || rol) return null;
  return <>{children}</>;
}
