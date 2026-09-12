"use client";

import { useState } from "react";

import { DistribucionesAdmin } from "@/components/admin/distribuciones";
import { FideicomisosAdmin } from "@/components/admin/fideicomisos";
import { KycAdmin } from "@/components/admin/kyc";
import { SolicitudesAdmin } from "@/components/admin/solicitudes";
import { RequireSession } from "@/components/require-session";
import { PageHeader, cn } from "@/components/ui";

const TABS = [
  { key: "solicitudes", label: "Originación", flujo: "Flujo 1" },
  { key: "kyc", label: "KYC y whitelist", flujo: "Flujo 2" },
  { key: "fideicomisos", label: "NAV y pool", flujo: "Flujo 4" },
  { key: "distribuciones", label: "Renta y AFIP", flujo: "Flujo 5" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>("solicitudes");
  return (
    <>
      <PageHeader
        kicker="Mesa de control"
        title="Administración"
        subtitle="Legajos, habilitaciones, emisiones y liquidación de renta. Cada acción la firmás con tu wallet."
      />
      <RequireSession admin>
        <div className="flex flex-wrap items-stretch gap-1 rounded-pill bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2.5 rounded-pill px-5 py-2.5 text-[12px] uppercase tracking-[0.14em] transition-all",
                tab === t.key
                  ? "bg-surface-2 font-semibold text-acid"
                  : "text-mute hover:bg-surface-2/60 hover:text-bone",
              )}
            >
              {t.label}
              <span className="text-[10px] tracking-[0.14em] text-dim">{t.flujo}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-6 py-6">
          {tab === "solicitudes" && <SolicitudesAdmin />}
          {tab === "kyc" && <KycAdmin />}
          {tab === "fideicomisos" && <FideicomisosAdmin />}
          {tab === "distribuciones" && <DistribucionesAdmin />}
        </div>
      </RequireSession>
    </>
  );
}
