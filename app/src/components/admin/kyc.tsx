"use client";

import { fidetok } from "@fidetok/client";
import { address } from "@solana/kit";
import { useState } from "react";

import { useFideTok } from "@/components/providers";
import { TxResult, type TxState } from "@/components/tx-result";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { explorer } from "@/lib/config";
import { fromHex, shortAddress } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { describeError } from "@/lib/solana/errors";
import { sendTx } from "@/lib/solana/tx";

type RiskFlag = { code: string; severity: "alta" | "media" | "info"; message: string };

type KycAdminRow = {
  wallet: string;
  nombre: string;
  apellido: string;
  dni: string;
  cuit: string;
  nacionalidad: string;
  residente_ar: boolean;
  origen_fondos: string;
  risk_flags: RiskFlag[];
  status: "pendiente" | "aprobado" | "rechazado";
  whitelist_tx: string | null;
  docs: { dni_frente: string | null; dni_dorso: string | null; selfie: string | null };
};

const SEVERITY = { alta: "danger", media: "warning", info: "info" } as const;
const STATUS = { pendiente: "warning", aprobado: "success", rechazado: "danger" } as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function KycAdmin() {
  const { data, error, reload } = useLoader(() => api<KycAdminRow[]>("/api/admin/kyc"), []);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-white/5" />;
  if (data.length === 0) return <Card className="text-sm text-slate-400">No hay verificaciones cargadas.</Card>;
  return (
    <div className="flex flex-col gap-4">
      {data.map((row) => (
        <KycRow key={row.wallet} row={row} onChange={reload} />
      ))}
    </div>
  );
}

function KycRow({ row, onChange }: { row: KycAdminRow; onChange: () => Promise<void> }) {
  const client = useFideTok();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<TxState>(null);
  const blocking = row.risk_flags.some((flag) => flag.severity === "alta");

  // Flujo 2: el servidor genera el commitment, el fiduciario lo firma en add_to_whitelist
  // y el servidor verifica la cuenta on-chain antes de dar el KYC por aprobado.
  async function aprobar() {
    setBusy("aprobar");
    setResult(null);
    try {
      const { commitment, residency } = await api<{ commitment: string; residency: "argentina" | "extranjero" }>(
        `/api/admin/kyc/${row.wallet}`,
        { json: { action: "preparar" } },
      );
      const ix = await fidetok.getAddToWhitelistInstructionAsync({
        admin: client.payer,
        wallet: address(row.wallet),
        kycCommitment: fromHex(commitment),
        residency: residency === "argentina" ? fidetok.Residency.Argentina : fidetok.Residency.Extranjero,
      });
      const signature = await sendTx(client, [ix]);
      for (let attempt = 0; ; attempt++) {
        try {
          await api(`/api/admin/kyc/${row.wallet}/confirmar`, { json: { signature } });
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          await sleep(1500);
        }
      }
      setResult({ kind: "ok", message: "Wallet agregada a la whitelist.", signature });
      await onChange();
    } catch (e) {
      setResult({ kind: "error", message: describeError(e) });
    } finally {
      setBusy(null);
    }
  }

  async function rechazar() {
    setBusy("rechazar");
    try {
      await api(`/api/admin/kyc/${row.wallet}`, { json: { action: "rechazar" } });
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
          <h3 className="font-semibold text-white">
            {row.apellido}, {row.nombre}
          </h3>
          <p className="font-mono text-xs text-slate-500">{shortAddress(row.wallet, 6)}</p>
        </div>
        <Badge tone={STATUS[row.status]}>{row.status}</Badge>
      </div>
      <div className="grid gap-4 text-sm sm:grid-cols-4">
        <Info label="DNI" value={row.dni} />
        <Info label="CUIT/CUIL" value={row.cuit} />
        <Info label="Residencia" value={row.residente_ar ? "Argentina" : `Exterior (${row.nacionalidad})`} />
        <Info label="Origen de fondos" value={row.origen_fondos.replace("_", " ")} />
      </div>
      <div className="flex flex-wrap gap-3">
        {(
          [
            ["DNI frente", row.docs.dni_frente],
            ["DNI dorso", row.docs.dni_dorso],
            ["Prueba de vida", row.docs.selfie],
          ] as const
        ).map(([label, url]) =>
          url ? (
            <a key={label} href={url} target="_blank" rel="noreferrer" className="group flex flex-col gap-1 text-xs text-slate-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={label} className="h-20 w-32 rounded-lg border border-line object-cover group-hover:border-slate-500" />
              {label}
            </a>
          ) : null,
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-500">Chequeo de riesgo (UIF / RePET / PEP)</span>
        {row.risk_flags.length === 0 ? (
          <Badge tone="success">Sin alertas</Badge>
        ) : (
          <div className="flex flex-wrap gap-2">
            {row.risk_flags.map((flag) => (
              <Badge key={flag.code} tone={SEVERITY[flag.severity]}>
                {flag.message}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {row.whitelist_tx && (
        <a className="text-xs text-emerald-300 hover:underline" href={explorer.tx(row.whitelist_tx)} target="_blank" rel="noreferrer">
          Tx de whitelist ↗
        </a>
      )}
      {row.status === "pendiente" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={aprobar} loading={busy === "aprobar"} disabled={blocking}>
            Aprobar y habilitar wallet
          </Button>
          <Button variant="secondary" onClick={rechazar} loading={busy === "rechazar"}>
            Rechazar
          </Button>
          {blocking && <span className="self-center text-xs text-rose-300">Hay alertas de severidad alta: no se puede aprobar.</span>}
        </div>
      )}
      <TxResult state={result} />
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="capitalize text-slate-200">{value}</div>
    </div>
  );
}
