"use client";

import { address } from "@solana/kit";
import Link from "next/link";
import { useState } from "react";

import { useFideTok } from "@/components/providers";
import { Badge, Card, LegalTag, Notice, PageHeader, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, type AssetKey } from "@/lib/config";
import type { FideicomisoPublico } from "@/lib/fideicomisos";
import { formatInt, formatUsd, formatUsdc } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { fetchFideicomisoState } from "@/lib/solana/onchain";

export default function MercadoPage() {
  const client = useFideTok();
  const [filter, setFilter] = useState<AssetKey | "todos">("todos");

  const { data, error, loading } = useLoader(async () => {
    const list = await api<FideicomisoPublico[]>("/api/fideicomisos");
    const states = await Promise.all(
      list.map((f) => fetchFideicomisoState(client.rpc, address(f.mint)).catch(() => null)),
    );
    return list.map((f, i) => ({ ...f, onchain: states[i] }));
  }, [client]);

  const visible = (data ?? []).filter((f) => filter === "todos" || f.asset_type === filter);

  return (
    <>
      <PageHeader
        title="Mercado de fideicomisos"
        subtitle="Certificados de participación emitidos en Solana. Solo inversores con KYC aprobado pueden suscribir o recibirlos."
        action={<LegalTag>Oferta privada · CNV</LegalTag>}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {(["todos", ...Object.keys(ASSET_LABELS)] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key as AssetKey | "todos")}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              filter === key ? "bg-emerald-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10",
            )}
          >
            {key === "todos" ? "Todos" : ASSET_LABELS[key as AssetKey]}
          </button>
        ))}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      )}
      {data && visible.length === 0 && (
        <Card className="text-sm text-slate-400">No hay fideicomisos emitidos en esta categoría todavía.</Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((f) => {
          const sold = Number(f.onchain?.sold ?? 0n);
          const max = Number(f.onchain?.maxSupply ?? BigInt(f.cantidad));
          const progress = max > 0 ? Math.min(100, (sold / max) * 100) : 0;
          return (
            <Link key={f.id} href={`/mercado/${f.mint}`}>
              <Card className="flex h-full flex-col gap-4 transition-colors hover:border-slate-500">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-white">{f.nombre}</h3>
                    <span className="font-mono text-xs text-slate-500">{f.simbolo}</span>
                  </div>
                  <Badge tone={f.asset_type === "rural" ? "warning" : "info"}>{ASSET_LABELS[f.asset_type]}</Badge>
                </div>
                {f.descripcion && <p className="line-clamp-2 text-sm text-slate-400">{f.descripcion}</p>}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Valuación</div>
                    <div className="font-medium text-slate-100">{formatUsd(f.valuacion_usd)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Valor cuotaparte</div>
                    <div className="font-medium text-slate-100">
                      {f.onchain ? formatUsdc(f.onchain.navPerToken) : `USDC ${f.precio_usdc}`}
                    </div>
                  </div>
                </div>
                <div className="mt-auto flex flex-col gap-1.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{formatInt(sold)} suscriptos</span>
                    <span>de {formatInt(max)}</span>
                  </div>
                </div>
                {f.asset_type === "rural" && (
                  <span className="text-xs text-amber-200/80">Ley 26.737: solo residentes argentinos</span>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
