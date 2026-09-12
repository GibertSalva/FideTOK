"use client";

import { address } from "@solana/kit";
import Link from "next/link";
import { useState } from "react";

import { AssetTile, IconUsdc } from "@/components/icons";
import { useFideTok, useSession } from "@/components/providers";
import { Display, Kicker, Meter, Notice, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, type AssetKey } from "@/lib/config";
import type { FideicomisoPublico } from "@/lib/fideicomisos";
import { formatInt, formatMoney, formatUsdcMoney } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { fetchFideicomisoState } from "@/lib/solana/onchain";

type Fila = FideicomisoPublico & { onchain: Awaited<ReturnType<typeof fetchFideicomisoState>> };

function suscripcion(f: Fila) {
  const sold = Number(f.onchain?.sold ?? 0n);
  const max = Number(f.onchain?.maxSupply ?? BigInt(f.cantidad));
  return { sold, max, pct: max > 0 ? (sold / max) * 100 : 0 };
}

/** Valor cuotaparte on-chain; si el fideicomiso no respondio, el precio de emision. */
function valorCp(f: Fila) {
  return formatUsdcMoney(f.onchain?.navPerToken ?? BigInt(Math.round(f.precio_usdc * 1_000_000)));
}

export default function MercadoPage() {
  const client = useFideTok();
  const { me } = useSession();
  const [filter, setFilter] = useState<AssetKey | "todos">("todos");
  const [query, setQuery] = useState("");

  const { data, error, loading } = useLoader(async () => {
    const list = await api<FideicomisoPublico[]>("/api/fideicomisos");
    const states = await Promise.all(
      list.map((f) => fetchFideicomisoState(client.rpc, address(f.mint)).catch(() => null)),
    );
    return list.map((f, i) => ({ ...f, onchain: states[i] })) as Fila[];
  }, [client]);

  const todos = data ?? [];
  const texto = query.trim().toLowerCase();
  const visible = todos.filter((f) => {
    if (filter !== "todos" && f.asset_type !== filter) return false;
    if (!texto) return true;
    return `${f.nombre} ${f.simbolo}`.toLowerCase().includes(texto);
  });

  // Los tres destacados son los que mas lejos estan de completar la suscripcion.
  const destacados = [...visible].sort((a, b) => suscripcion(a).pct - suscripcion(b).pct).slice(0, 3);

  const totales = todos.reduce(
    (acc, f) => ({
      valuacion: acc.valuacion + f.valuacion_usd,
      suscriptas: acc.suscriptas + suscripcion(f).sold,
    }),
    { valuacion: 0, suscriptas: 0 },
  );

  const kycOk = me?.kyc?.status === "aprobado";

  return (
    <div className="flex flex-1 flex-col gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Display size="lg" as="h1">
          Mercado
        </Display>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-card bg-surface px-5 py-3.5 shadow-card">
            <Kicker>Tokenizado</Kicker>
            <div className="mt-2 text-[22px] font-medium tabular-nums">
              {formatMoney(totales.valuacion)}
            </div>
          </div>
          <div className="rounded-card bg-surface px-5 py-3.5 shadow-card">
            <Kicker>Cuotapartes suscriptas</Kicker>
            <div className="mt-2 text-[22px] font-medium tabular-nums text-acid">
              {formatInt(totales.suscriptas)}
            </div>
          </div>
        </div>
      </div>

      {destacados.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          {destacados.map((f) => (
            <Link
              key={f.id}
              href={`/mercado/${f.mint}`}
              className="group flex min-w-0 flex-col rounded-card bg-surface px-6 py-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised"
            >
              <div className="flex items-center gap-3">
                <AssetTile type={f.asset_type} />
                <span className="min-w-0 flex-1 truncate font-display text-[17px]">{f.nombre}</span>
                <span className="hidden shrink-0 rounded-pill bg-surface-2 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-mute sm:inline-flex">
                  {formatMoney(f.valuacion_usd)}
                </span>
              </div>
              <div className="mt-6 flex items-end justify-between gap-4">
                <div className="flex items-center gap-2">
                  <IconUsdc size={20} className="shrink-0 text-mute" />
                  <span className="text-[38px] font-medium leading-none tabular-nums text-acid">{valorCp(f)}</span>
                </div>
                <span className="text-[20px] text-mute transition-colors group-hover:text-acid">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-stretch gap-1 rounded-pill bg-surface p-1">
          {(["todos", ...Object.keys(ASSET_LABELS)] as const).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key as AssetKey | "todos")}
              className={cn(
                "rounded-pill px-4 py-2 text-[12px] uppercase tracking-[0.14em] transition-all",
                filter === key
                  ? "bg-acid font-semibold text-ink"
                  : "text-mute hover:bg-surface-2 hover:text-bone",
              )}
            >
              {key === "todos" ? "Todos" : ASSET_LABELS[key as AssetKey]}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar…"
          className="ml-auto h-11 w-full min-w-[200px] max-w-xs rounded-pill bg-field px-4 text-[15px] text-bone outline-none ring-1 ring-line transition-all placeholder:text-dim focus:ring-2 focus:ring-acid/60"
        />
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data && <div className="h-64 animate-pulse rounded-card bg-surface" />}

      {data && (
        <div className="overflow-x-auto rounded-card bg-surface p-2 shadow-card">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[minmax(0,2fr)_140px_minmax(0,1fr)_120px] items-center gap-4 px-4 py-3 text-[10.5px] uppercase tracking-[0.14em] text-mute">
              <span>Fideicomiso</span>
              <span>Valor cuotaparte</span>
              <span>Suscripto</span>
              <span />
            </div>

            {visible.length === 0 && (
              <p className="px-4 py-8 text-[12.5px] tracking-[0.02em] text-mute">
                No hay fideicomisos que coincidan con el filtro.
              </p>
            )}

            {visible.map((f, i) => {
              const { pct } = suscripcion(f);
              return (
                <Link
                  key={f.id}
                  href={`/mercado/${f.mint}`}
                  className={cn(
                    "group grid grid-cols-[minmax(0,2fr)_140px_minmax(0,1fr)_120px] items-center gap-4 rounded-card px-4 py-4 transition-colors hover:bg-surface-2",
                    i === 0 && "bg-acid/[0.06]",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AssetTile type={f.asset_type} />
                    <div className="min-w-0">
                      <div className="truncate font-display text-[17px]">{f.nombre}</div>
                      <div className="mt-0.5 truncate text-[10.5px] uppercase tracking-[0.14em] text-mute">
                        {ASSET_LABELS[f.asset_type]} · {f.simbolo}
                      </div>
                    </div>
                  </div>

                  <div className="text-[19px] font-medium tabular-nums text-acid">{valorCp(f)}</div>

                  <div className="min-w-0">
                    <Meter pct={pct} />
                    <div className="mt-1.5 text-[10.5px] tracking-[0.02em] text-mute">{pct.toFixed(0)}%</div>
                  </div>

                  <span
                    className={cn(
                      "rounded-pill px-4 py-2.5 text-center text-[11px] uppercase tracking-[0.14em] transition-all",
                      kycOk
                        ? "bg-acid font-semibold text-ink"
                        : "bg-surface-2 text-mute group-hover:bg-surface-3 group-hover:text-bone",
                    )}
                  >
                    {kycOk ? "Suscribir" : "Ver"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {data && !kycOk && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-surface px-6 py-5 shadow-card">
          <p className="text-[12.5px] tracking-[0.02em] text-mute">
            Para suscribir necesitás la verificación aprobada.
          </p>
          <Link
            href="/kyc"
            className="rounded-pill bg-acid px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition-all hover:brightness-110"
          >
            Verificarme →
          </Link>
        </div>
      )}
    </div>
  );
}

