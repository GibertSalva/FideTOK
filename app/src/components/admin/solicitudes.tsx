"use client";

import { fidetok, fidetokHook } from "@fidetok/client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { address, generateKeyPairSigner } from "@solana/kit";
import { useState } from "react";

import { useFideTok } from "@/components/providers";
import { TxResult, type TxState } from "@/components/tx-result";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, explorer, usdcMint, type AssetKey } from "@/lib/config";
import { formatInt, formatUsd, fromHex, shortAddress, usdcToBase } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { describeError } from "@/lib/solana/errors";
import { sendTx } from "@/lib/solana/tx";

type SolicitudAdmin = {
  id: string;
  originador_wallet: string;
  asset_type: AssetKey;
  nombre: string;
  simbolo: string;
  descripcion: string | null;
  valuacion_usd: number;
  cuit_fideicomiso: string;
  registro: string;
  precio_usdc: number;
  cantidad: number;
  contrato_sha256: string;
  contrato_url: string | null;
  status: "pendiente_auditoria" | "aprobada" | "emitida" | "rechazada";
  mint: string | null;
  emision_tx: string | null;
};

const STATUS = {
  pendiente_auditoria: { tone: "warning", label: "Pendiente de auditoría" },
  aprobada: { tone: "info", label: "Aprobada · lista para emitir" },
  emitida: { tone: "success", label: "Emitida" },
  rechazada: { tone: "danger", label: "Rechazada" },
} as const;

const ASSET_ENUM: Record<AssetKey, fidetok.AssetType> = {
  inmueble: fidetok.AssetType.Inmueble,
  rural: fidetok.AssetType.Rural,
  creditos: fidetok.AssetType.Creditos,
  otro: fidetok.AssetType.Otro,
};

export function SolicitudesAdmin() {
  const { data, error, reload } = useLoader(() => api<SolicitudAdmin[]>("/api/admin/solicitudes"), []);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-white/5" />;
  if (data.length === 0) return <Card className="text-sm text-slate-400">No hay solicitudes de tokenización.</Card>;
  return (
    <div className="flex flex-col gap-4">
      {data.map((s) => (
        <SolicitudRow key={s.id} solicitud={s} onChange={reload} />
      ))}
    </div>
  );
}

function SolicitudRow({ solicitud: s, onChange }: { solicitud: SolicitudAdmin; onChange: () => Promise<void> }) {
  const client = useFideTok();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<TxState>(null);

  async function audit(action: "aprobar" | "rechazar") {
    setBusy(action);
    setResult(null);
    try {
      await api(`/api/admin/solicitudes/${s.id}`, { json: { action } });
      await onChange();
    } catch (e) {
      setResult({ kind: "error", message: describeError(e) });
    } finally {
      setBusy(null);
    }
  }

  // Flujo 1: emite el mint Token-2022 con la metadata legal y registra las cuentas del transfer hook.
  async function emitir() {
    setBusy("emitir");
    setResult(null);
    try {
      const mint = await generateKeyPairSigner();
      const origin = window.location.origin;
      const create = await fidetok.getCreateFideicomisoInstructionAsync({
        admin: client.payer,
        originador: address(s.originador_wallet),
        mint,
        usdcMint: usdcMint(),
        usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
        name: s.nombre,
        symbol: s.simbolo,
        uri: `${origin}/api/metadata/${mint.address}`,
        assetType: ASSET_ENUM[s.asset_type],
        cuitFideicomiso: s.cuit_fideicomiso,
        registro: s.registro ?? "",
        contratoUri: `${origin}/verificar/${mint.address}`,
        contractSha256: fromHex(s.contrato_sha256),
        valuationUsd: BigInt(Math.round(s.valuacion_usd)),
        pricePerToken: usdcToBase(Number(s.precio_usdc)),
        maxSupply: BigInt(s.cantidad),
      });
      const hook = await fidetokHook.getInitializeExtraAccountMetaListInstructionAsync({
        payer: client.payer,
        mint: mint.address,
      });
      let signature: string;
      try {
        signature = await sendTx(client, [create, hook]);
      } catch (e) {
        // Si no entra en una sola transaccion, se emite en dos pasos.
        if (!/too large|exceeds|size/i.test(describeError(e))) throw e;
        signature = await sendTx(client, [create]);
        await sendTx(client, [hook]);
      }
      await api(`/api/admin/solicitudes/${s.id}/emitida`, { json: { mint: mint.address, signature } });
      setResult({ kind: "ok", message: `Certificados emitidos. Mint ${shortAddress(mint.address, 6)}.`, signature });
      await onChange();
    } catch (e) {
      setResult({ kind: "error", message: describeError(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{s.nombre}</h3>
            <span className="font-mono text-xs text-slate-500">{s.simbolo}</span>
          </div>
          <p className="text-xs text-slate-500">
            {ASSET_LABELS[s.asset_type]} · originador {shortAddress(s.originador_wallet)}
          </p>
        </div>
        <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
      </div>
      <div className="grid gap-4 text-sm sm:grid-cols-4">
        <Info label="Valuación" value={formatUsd(s.valuacion_usd)} />
        <Info label="Certificados" value={formatInt(s.cantidad)} />
        <Info label="Precio" value={`USDC ${s.precio_usdc}`} />
        <Info label="CUIT fideicomiso" value={s.cuit_fideicomiso} />
      </div>
      <div className="flex flex-col gap-1 text-xs">
        {s.contrato_url ? (
          <a className="font-semibold text-emerald-300 hover:underline" href={s.contrato_url} target="_blank" rel="noreferrer">
            Ver contrato firmado (PDF) ↗
          </a>
        ) : (
          <span className="text-rose-300">Contrato no disponible</span>
        )}
        <span className="break-all font-mono text-slate-500">sha256 {s.contrato_sha256}</span>
        {s.mint && (
          <a className="font-mono text-emerald-300 hover:underline" href={explorer.address(s.mint)} target="_blank" rel="noreferrer">
            mint {s.mint}
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {s.status === "pendiente_auditoria" && (
          <>
            <Button onClick={() => audit("aprobar")} loading={busy === "aprobar"} disabled={!s.contrato_url}>
              Aprobar documentación
            </Button>
            <Button variant="secondary" onClick={() => audit("rechazar")} loading={busy === "rechazar"}>
              Rechazar
            </Button>
          </>
        )}
        {s.status === "aprobada" && (
          <Button onClick={emitir} loading={busy === "emitir"}>
            Emitir en Solana
          </Button>
        )}
      </div>
      <TxResult state={result} />
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-slate-200">{value}</div>
    </div>
  );
}
