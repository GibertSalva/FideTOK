"use client";

import type { ReactNode } from "react";

import { useSession } from "@/components/providers";
import { Display, Kicker, Notice, Section } from "@/components/ui";

export function RequireSession({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { me, loading } = useSession();
  if (loading) return <div className="my-8 h-40 animate-pulse rounded-card bg-surface" />;
  if (!me?.session) {
    return (
      <Section>
        <Kicker className="text-acid">Sin operar</Kicker>
        <Display size="lg" className="mt-4">
          Conectá tu wallet
        </Display>
        <p className="mt-4 max-w-xl text-[12.5px] leading-relaxed tracking-[0.02em] text-mute">
          Conectá Phantom arriba a la derecha y firmá el mensaje de ingreso. La firma no mueve fondos.
        </p>
      </Section>
    );
  }
  if (admin && !me.session.isAdmin) {
    return (
      <Section>
        <Notice tone="danger">Esta sección es solo para el administrador.</Notice>
      </Section>
    );
  }
  return <>{children}</>;
}
