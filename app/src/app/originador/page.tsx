"use client";

import { useState, type FormEvent } from "react";

import { RequireSession } from "@/components/require-session";
import { Badge, Button, Card, Field, Input, LegalTag, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, explorer, type AssetKey } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { describeError } from "@/lib/solana/errors";
import { sha256Hex, uploadFile } from "@/lib/upload";

type Solicitud = {
  id: string;
  nombre: string;
  simbolo: string;
  asset_type: AssetKey;
  status: "pendiente_auditoria" | "aprobada" | "emitida" | "rechazada";
  mint: string | null;
  emision_tx: string | null;
  created_at: string;
};

const STATUS_BADGE = {
  pendiente_auditoria: { tone: "warning", label: "Pendiente de auditoría" },
  aprobada: { tone: "info", label: "Aprobada · lista para emitir" },
  emitida: { tone: "success", label: "Emitida en Solana" },
  rechazada: { tone: "danger", label: "Rechazada" },
} as const;

// Campos propios de cada tipo de activo (quedan en detalle_activo).
const ASSET_FIELDS: Record<AssetKey, Array<{ name: string; label: string; placeholder?: string }>> = {
  inmueble: [
    { name: "direccion", label: "Dirección", placeholder: "Av. Hipólito Yrigoyen 500, Córdoba" },
    { name: "superficie_m2", label: "Superficie (m²)" },
    { name: "renta_mensual_ars", label: "Alquiler mensual estimado (ARS)" },
  ],
  rural: [
    { name: "ubicacion", label: "Partido / provincia", placeholder: "Río Cuarto, Córdoba" },
    { name: "hectareas", label: "Hectáreas" },
    { name: "actividad", label: "Actividad", placeholder: "Agricultura (soja / maíz)" },
  ],
  creditos: [
    { name: "deudor_cedido", label: "Deudor cedido" },
    { name: "valor_nominal_usd", label: "Valor nominal (USD)" },
    { name: "vencimiento", label: "Vencimiento" },
  ],
  otro: [{ name: "detalle", label: "Detalle del activo" }],
};

export default function OriginadorPage() {
  return (
    <>
      <PageHeader
        title="Tokenizar un activo"
        subtitle="Cargá el activo y el contrato de fideicomiso firmado. El fiduciario audita los papeles y recién ahí emite los certificados en Solana."
        action={<LegalTag>CCyC · AFIP</LegalTag>}
      />
      <RequireSession>
        <Originador />
      </RequireSession>
    </>
  );
}

function Originador() {
  const { data: solicitudes, reload } = useLoader(() => api<Solicitud[]>("/api/solicitudes").catch(() => []), []);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <SolicitudForm onCreated={reload} />
      <Card className="flex h-fit flex-col gap-4">
        <h3 className="font-semibold text-white">Mis solicitudes</h3>
        {solicitudes === null && <div className="h-16 animate-pulse rounded-xl bg-white/5" />}
        {solicitudes?.length === 0 && <p className="text-sm text-slate-500">Todavía no cargaste ningún activo.</p>}
        {solicitudes?.map((s) => (
          <div key={s.id} className="flex flex-col gap-1.5 border-t border-line pt-3 first:border-0 first:pt-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-100">{s.nombre}</span>
              <span className="font-mono text-xs text-slate-500">{s.simbolo}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_BADGE[s.status].tone}>{STATUS_BADGE[s.status].label}</Badge>
              <span className="text-xs text-slate-500">{ASSET_LABELS[s.asset_type]}</span>
            </div>
            {s.mint && (
              <a className="font-mono text-xs text-emerald-300 hover:underline" href={explorer.address(s.mint)} target="_blank" rel="noreferrer">
                mint {shortAddress(s.mint, 6)}
              </a>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

function SolicitudForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [assetType, setAssetType] = useState<AssetKey>("inmueble");
  const [contractHash, setContractHash] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    const contrato = data.get("contrato");
    try {
      if (!(contrato instanceof File) || contrato.size === 0) throw new Error("Subí el contrato de fideicomiso firmado (PDF)");
      setStep("Calculando hash del contrato…");
      const hash = await sha256Hex(contrato);
      setStep("Subiendo contrato…");
      const path = await uploadFile("contratos", "contrato", contrato);
      setStep("Enviando solicitud…");
      const detalle = Object.fromEntries(ASSET_FIELDS[assetType].map((f) => [f.name, data.get(f.name) ?? ""]));
      await api("/api/solicitudes", {
        json: {
          asset_type: assetType,
          nombre: data.get("nombre"),
          simbolo: data.get("simbolo"),
          descripcion: data.get("descripcion"),
          detalle_activo: detalle,
          valuacion_usd: data.get("valuacion_usd"),
          cuit_fideicomiso: data.get("cuit_fideicomiso"),
          registro: data.get("registro"),
          precio_usdc: data.get("precio_usdc"),
          cantidad: data.get("cantidad"),
          contrato_path: path,
          contrato_sha256: hash,
        },
      });
      form.reset();
      setContractHash(null);
      setDone(true);
      await onCreated();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setStep(null);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="grid gap-5 md:grid-cols-2">
        <Field label="Tipo de activo">
          <Select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetKey)}>
            {Object.entries(ASSET_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          {assetType === "rural" && (
            <Notice tone="warning">Activo rural: aplica la Ley 26.737 y el contrato bloquea inversores extranjeros.</Notice>
          )}
        </div>
        <Field label="Nombre del fideicomiso" hint="Máximo 32 caracteres (queda en el token)">
          <Input name="nombre" required maxLength={32} placeholder="Edificio Nueva Córdoba" />
        </Field>
        <Field label="Símbolo" hint="Máximo 10 caracteres">
          <Input name="simbolo" required maxLength={10} placeholder="FNCBA" className="uppercase" />
        </Field>
        {ASSET_FIELDS[assetType].map((field) => (
          <Field key={`${assetType}-${field.name}`} label={field.label}>
            <Input name={field.name} placeholder={field.placeholder} />
          </Field>
        ))}
        <div className="md:col-span-2">
          <Field label="Descripción">
            <Textarea name="descripcion" maxLength={1000} placeholder="De dónde sale la renta, plazo del fideicomiso, etc." />
          </Field>
        </div>
        <Field label="CUIT del fideicomiso">
          <Input name="cuit_fideicomiso" required placeholder="30-71234567-8" />
        </Field>
        <Field label="Matrícula / inscripción registral" hint="Si aplica al activo">
          <Input name="registro" maxLength={64} placeholder="Matrícula 1.234.567 - RPI Córdoba" />
        </Field>
        <Field label="Valuación (USD)">
          <Input name="valuacion_usd" required type="number" min={1} step="any" placeholder="1000000" />
        </Field>
        <Field label="Cantidad de certificados">
          <Input name="cantidad" required type="number" min={1} step={1} placeholder="10000" />
        </Field>
        <Field label="Precio por certificado (USDC)">
          <Input name="precio_usdc" required type="number" min={0.000001} step="any" placeholder="100" />
        </Field>
        <Field label="Contrato de fideicomiso firmado (PDF)" hint="Su hash sha256 queda grabado en el token">
          <Input
            name="contrato"
            type="file"
            accept="application/pdf"
            required
            className="pt-2"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setContractHash(file ? await sha256Hex(file) : null);
            }}
          />
        </Field>
        {contractHash && (
          <p className="break-all font-mono text-xs text-slate-500 md:col-span-2">sha256: {contractHash}</p>
        )}
        {error && (
          <div className="md:col-span-2">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        {done && (
          <div className="md:col-span-2">
            <Notice tone="success">Solicitud enviada. Queda pendiente de auditoría del fiduciario.</Notice>
          </div>
        )}
        <div className="md:col-span-2">
          <Button type="submit" loading={step !== null}>
            {step ?? "Enviar a auditoría"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
