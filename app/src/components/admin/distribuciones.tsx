"use client";

import { fidetok } from "@fidetok/client";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { address, type Address } from "@solana/kit";
import { useMemo, useState } from "react";

import { useFideTok } from "@/components/providers";
import { Badge, Button, Card, Field, Input, LegalTag, Notice, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { explorer, usdcMint, USDC_UNIT } from "@/lib/config";
import type { FideicomisoPublico } from "@/lib/fideicomisos";
import { formatArs, formatInt, formatUsdc, shortAddress } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { describeError } from "@/lib/solana/errors";
import { fetchFideicomisoState, fetchHolders } from "@/lib/solana/onchain";
import { findDistributionPda } from "@/lib/solana/pdas";
import { sendTx } from "@/lib/solana/tx";

type DistribucionRow = {
  id: string;
  mint: string;
  indice: number;
  total_usdc: number;
  ars_por_usd: number;
  fx_source: string;
  fx_timestamp: string;
  start_tx: string | null;
  close_tx: string | null;
  pagos: Array<{ count: number }>;
};

const PAGOS_POR_TX = 3;

export function DistribucionesAdmin() {
  const fideicomisos = useLoader(() => api<FideicomisoPublico[]>("/api/fideicomisos"), []);
  const historial = useLoader(() => api<DistribucionRow[]>("/api/admin/distribuciones"), []);
  const [selected, setSelected] = useState<string>("");
  const mint = selected || fideicomisos.data?.[0]?.mint || "";

  if (fideicomisos.error) return <Notice tone="danger">{fideicomisos.error}</Notice>;
  if (!fideicomisos.data) return <div className="h-40 animate-pulse rounded-card bg-surface" />;
  if (fideicomisos.data.length === 0) return <Card className="text-sm text-mute">Todavía no hay fideicomisos emitidos.</Card>;

  const nombres = new Map(fideicomisos.data.map((f) => [f.mint, f.nombre]));
  return (
    <div className="flex flex-col gap-6">
      <Field label="Fideicomiso">
        <Select value={mint} onChange={(e) => setSelected(e.target.value)} className="max-w-md">
          {fideicomisos.data.map((f) => (
            <option key={f.mint} value={f.mint}>
              {f.nombre} ({f.simbolo})
            </option>
          ))}
        </Select>
      </Field>
      {mint && <NuevaDistribucion key={mint} mint={address(mint)} onDone={historial.reload} />}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[22px] uppercase tracking-[-0.02em]">Distribuciones y reportes fiscales</h3>
          <LegalTag>AFIP</LegalTag>
        </div>
        {(historial.data ?? []).length === 0 && <p className="text-sm text-dim">Sin distribuciones todavía.</p>}
        {(historial.data ?? []).map((d) => (
          <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3 text-sm first:border-0 first:pt-0">
            <div className="flex flex-col">
              <span className="text-bone">
                {nombres.get(d.mint) ?? shortAddress(d.mint)} · #{d.indice}
              </span>
              <span className="text-xs text-dim">
                {formatUsdc(BigInt(Math.round(Number(d.total_usdc) * Number(USDC_UNIT))))} · TC {d.ars_por_usd} ({d.fx_source}) ·{" "}
                {d.pagos?.[0]?.count ?? 0} pagos
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={d.close_tx ? "success" : "warning"}>{d.close_tx ? "Cerrada" : "Abierta"}</Badge>
              <a className="text-xs font-semibold text-acid hover:underline" href={`/api/admin/reportes/${d.id}`}>
                Descargar CSV
              </a>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function NuevaDistribucion({ mint, onDone }: { mint: Address; onDone: () => Promise<void> }) {
  const client = useFideTok();
  const [ars, setArs] = useState("1530000");
  const [tc, setTc] = useState<string>("");
  const [log, setLog] = useState<Array<{ text: string; signature?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fx = useLoader(() => api<{ venta: number; fecha: string; fuente: string }>("/api/fx"), []);
  const data = useLoader(async () => {
    const { wallets } = await api<{ wallets: string[] }>("/api/admin/whitelist");
    const candidatos = wallets.map((wallet) => address(wallet));
    const [state, holders] = await Promise.all([
      fetchFideicomisoState(client.rpc, mint),
      fetchHolders(client.rpc, mint, candidatos),
    ]);
    // Solo cuentas asociadas (ATA): es la cuenta que valida pay_dividend.
    const valid = await Promise.all(
      holders.map(async (h) => {
        const [ata] = await findAssociatedTokenPda({ owner: h.owner, mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
        return ata === h.address ? h : null;
      }),
    );
    return { state, holders: valid.filter((h): h is NonNullable<typeof h> => h !== null) };
  }, [client, mint]);

  const tipoCambio = Number(tc || fx.data?.venta || 0);
  const totalUsdc = tipoCambio > 0 ? BigInt(Math.floor((Number(ars) / tipoCambio) * Number(USDC_UNIT))) : 0n;
  const supply = data.data?.holders.reduce((acc, h) => acc + h.amount, 0n) ?? 0n;
  const preview = useMemo(
    () =>
      (data.data?.holders ?? []).map((h) => ({
        ...h,
        usdc: supply > 0n ? (h.amount * totalUsdc) / supply : 0n,
      })),
    [data.data, supply, totalUsdc],
  );

  const addLog = (text: string, signature?: string) => setLog((items) => [...items, { text, signature }]);

  // Flujo 5 completo: inicia (congela saldos), paga en lotes a cada tenedor, registra y cierra.
  async function ejecutar() {
    const state = data.data?.state;
    if (!state) return;
    setBusy(true);
    setError(null);
    setLog([]);
    try {
      const usdc = usdcMint();
      const [adminUsdcAccount] = await findAssociatedTokenPda({ owner: client.payer.address, mint: usdc, tokenProgram: TOKEN_PROGRAM_ADDRESS });
      let index = state.distributionCount;
      let distribucionId: string | null = null;

      if (state.transfersLocked) {
        index = state.distributionCount - 1;
        addLog(`Retomando la distribución #${index} que quedó abierta.`);
      } else {
        const distribution = await findDistributionPda(state.address, index);
        const fxTimestamp = BigInt(Math.floor(Date.now() / 1000));
        const start = await fidetok.getStartDistributionInstructionAsync({
          admin: client.payer,
          mint,
          distribution,
          usdcMint: usdc,
          adminUsdcAccount,
          usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
          totalUsdc,
          arsPerUsd: BigInt(Math.round(tipoCambio * 10_000)),
          fxSource: fidetok.FxSource.OficialBna,
          fxTimestamp,
        });
        const signature = await sendTx(client, [start]);
        addLog(`Distribución #${index} iniciada: ${formatUsdc(totalUsdc)} depositados y saldos congelados.`, signature);
        const created = await api<{ id: string }>("/api/admin/distribuciones", {
          json: {
            mint,
            indice: index,
            distribution_address: distribution,
            total_usdc: Number(totalUsdc) / Number(USDC_UNIT),
            ars_por_usd: tipoCambio,
            fx_source: fx.data?.fuente ?? "Dólar oficial",
            fx_timestamp: new Date(Number(fxTimestamp) * 1000).toISOString(),
            start_tx: signature,
          },
        });
        distribucionId = created.id;
      }

      const distribution = await findDistributionPda(state.address, index);
      const onchain = await fidetok.fetchDistribution(client.rpc, distribution);
      const { totalUsdc: total, supplySnapshot, arsPerUsd } = onchain.data;
      const tcOnchain = Number(arsPerUsd) / 10_000;

      // Tenedores que todavia no cobraron (el recibo Payout evita pagar dos veces).
      const pendientes: typeof preview = [];
      for (const holder of data.data?.holders ?? []) {
        const [payout] = await fidetok.findPayoutPda({ distribution, holder: holder.owner });
        const exists = await fidetok.fetchMaybePayout(client.rpc, payout);
        if (!exists.exists) pendientes.push({ ...holder, usdc: (holder.amount * total) / supplySnapshot });
      }

      for (let i = 0; i < pendientes.length; i += PAGOS_POR_TX) {
        const lote = pendientes.slice(i, i + PAGOS_POR_TX);
        const ixs = await Promise.all(
          lote.map((holder) =>
            fidetok.getPayDividendInstructionAsync({
              payer: client.payer,
              mint,
              distribution,
              usdcMint: usdc,
              holder: holder.owner,
              usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
            }),
          ),
        );
        const signature = await sendTx(client, ixs);
        addLog(`Pagados ${lote.length} tenedores.`, signature);
        if (distribucionId) {
          await api(`/api/admin/distribuciones/${distribucionId}/pagos`, {
            json: {
              pagos: lote.map((holder) => {
                const usdcAmount = Number(holder.usdc) / Number(USDC_UNIT);
                return {
                  wallet: holder.owner,
                  tokens: Number(holder.amount),
                  porcentaje: (Number(holder.amount) / Number(supplySnapshot)) * 100,
                  usdc: usdcAmount,
                  ars: usdcAmount * tcOnchain,
                  tx: signature,
                };
              }),
            },
          });
        }
      }

      const close = await fidetok.getCloseDistributionInstructionAsync({
        admin: client.payer,
        fideicomiso: state.address,
        distribution,
        usdcMint: usdc,
        adminUsdcAccount,
        usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      const closeSignature = await sendTx(client, [close]);
      addLog("Distribución cerrada: transferencias habilitadas de nuevo.", closeSignature);
      if (distribucionId) await api(`/api/admin/distribuciones/${distribucionId}/cerrar`, { json: { close_tx: closeSignature } });
      await Promise.all([data.reload(), onDone()]);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const state = data.data?.state;
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[22px] uppercase tracking-[-0.02em]">Distribuir renta del período</h3>
        {state?.transfersLocked && <Badge tone="warning">Hay una distribución abierta</Badge>}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Renta cobrada (ARS)" hint="Alquileres, cosecha o cobranzas del período">
          <Input type="number" min={0} step="any" value={ars} onChange={(e) => setArs(e.target.value)} />
        </Field>
        <Field
          label="Tipo de cambio (ARS por USD)"
          hint={fx.data ? `${fx.data.fuente}: venta ${fx.data.venta}` : "Cargando dólar oficial…"}
        >
          <Input type="number" min={0} step="any" value={tc} placeholder={fx.data ? String(fx.data.venta) : ""} onChange={(e) => setTc(e.target.value)} />
        </Field>
        <div className="flex flex-col justify-end gap-1 rounded-card bg-surface-2 px-4 py-3">
          <span className="text-xs text-dim">A distribuir en USDC</span>
          <span className="text-lg font-semibold text-bone tabular-nums">{formatUsdc(totalUsdc)}</span>
          <span className="text-xs text-dim">
            {formatArs(Number(ars) || 0)} ÷ {tipoCambio || "—"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[10.5px] uppercase tracking-[0.16em] text-mute">
            <tr>
              <th className="py-2 pr-4 font-medium">Tenedor</th>
              <th className="py-2 pr-4 font-medium">Certificados</th>
              <th className="py-2 pr-4 font-medium">Participación</th>
              <th className="py-2 pr-4 font-medium">Recibe</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((h) => (
              <tr key={h.address} className="border-t border-line/60">
                <td className="py-2 pr-4 text-xs text-mute">{shortAddress(h.owner, 6)}</td>
                <td className="py-2 pr-4 tabular-nums">{formatInt(h.amount)}</td>
                <td className="py-2 pr-4 tabular-nums">{supply > 0n ? ((Number(h.amount) / Number(supply)) * 100).toFixed(2) : 0}%</td>
                <td className="py-2 pr-4 tabular-nums text-acid">{formatUsdc(h.usdc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.data && preview.length === 0 && <p className="py-3 text-sm text-dim">Nadie tiene certificados de este fideicomiso todavía.</p>}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {log.length > 0 && (
        <ol className="flex flex-col gap-1.5 text-sm">
          {log.map((item, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-mute">
              <span className="text-acid">✓</span>
              {item.text}
              {item.signature && (
                <a className="text-xs text-acid hover:underline" href={explorer.tx(item.signature)} target="_blank" rel="noreferrer">
                  tx ↗
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
      <Button onClick={ejecutar} loading={busy} disabled={preview.length === 0 || (!state?.transfersLocked && totalUsdc <= 0n)}>
        {state?.transfersLocked ? "Pagar pendientes y cerrar" : "Ejecutar distribución"}
      </Button>
    </Card>
  );
}
