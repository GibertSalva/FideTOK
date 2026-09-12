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
        title="Panel del fiduciario"
        subtitle="Audita la documentación, habilita inversores, emite los certificados y reparte la renta. Cada acción on-chain la firmás con tu wallet."
      />
      <RequireSession admin>
        <div className="mb-6 flex flex-wrap gap-2 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors",
                tab === t.key ? "border-emerald-400 text-white" : "border-transparent text-slate-400 hover:text-white",
              )}
            >
              {t.label}
              <span className="font-mono text-[10px] uppercase text-slate-500">{t.flujo}</span>
            </button>
          ))}
        </div>
        {tab === "solicitudes" && <SolicitudesAdmin />}
        {tab === "kyc" && <KycAdmin />}
        {tab === "fideicomisos" && <FideicomisosAdmin />}
        {tab === "distribuciones" && <DistribucionesAdmin />}
      </RequireSession>
    </>
  );
}
