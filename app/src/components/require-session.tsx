"use client";

import type { ReactNode } from "react";

import { useSession } from "@/components/providers";
import { Card, Notice } from "@/components/ui";

export function RequireSession({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { me, loading } = useSession();
  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-white/5" />;
  if (!me?.session) {
    return (
      <Card className="flex flex-col items-start gap-2">
        <h2 className="text-lg font-semibold text-white">Ingresá con tu wallet</h2>
        <p className="text-sm text-slate-400">
          Conectá Phantom (arriba a la derecha) y firmá el mensaje de ingreso. La firma no mueve fondos.
        </p>
      </Card>
    );
  }
  if (admin && !me.session.isAdmin) return <Notice tone="danger">Esta sección es solo para el fiduciario.</Notice>;
  return <>{children}</>;
}
