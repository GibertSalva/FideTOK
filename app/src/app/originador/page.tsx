"use client";

import { useState, type FormEvent } from "react";

import { RequireSession } from "@/components/require-session";
import {
  Badge,
  Button,
  DataRow,
  Display,
  Field,
  Input,
  Kicker,
  LegalTag,
  Notice,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, explorer, HONORARIO_PCT, type AssetKey } from "@/lib/config";
import { formatInt, formatMoney, formatUsdcMoney, shortAddress, usdcToBase } from "@/lib/format";
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

const FILE_INPUT =
  "py-2 text-[11px] uppercase tracking-[0.12em] text-mute file:mr-3 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3.5 file:py-2 file:text-[11px] file:uppercase file:tracking-[0.12em] file:text-mute hover:file:bg-surface-3 hover:file:text-acid";

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
        kicker="Originación"
        title="Nueva emisión"
        subtitle="El fiduciario controla título, gravámenes y tasación antes de que los certificados coticen."
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
    <div className="flex flex-col">
      <SolicitudForm onCreated={reload} />

      <div className="pb-6">
        <Kicker>Emisiones presentadas</Kicker>
        {solicitudes === null && <div className="mt-4 h-16 animate-pulse rounded-card bg-surface" />}
        {solicitudes?.length === 0 && (
          <p className="mt-4 text-[12.5px] tracking-[0.02em] text-mute">Todavía no cargaste ningún activo.</p>
        )}
        {solicitudes && solicitudes.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {solicitudes.map((s, i) => (
              <div
                key={s.id}
                className="grid items-center gap-4.5 rounded-card bg-surface px-6 py-5 shadow-card md:grid-cols-[44px_minmax(0,1fr)_200px_minmax(0,200px)]"
              >
                <div className="text-[12px] font-semibold text-mute">{String(i + 1).padStart(2, "0")}</div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-mute">
                    {ASSET_LABELS[s.asset_type]} · {s.simbolo}
                  </div>
                  <Display size="xs" as="h3" className="mt-1">
                    {s.nombre}
                  </Display>
                </div>
                <Badge tone={STATUS_BADGE[s.status].tone}>{STATUS_BADGE[s.status].label}</Badge>
                {s.mint ? (
                  <a
                    className="truncate text-[12px] tracking-[0.06em] text-acid hover:underline md:text-right"
                    href={explorer.address(s.mint)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    mint {shortAddress(s.mint, 6)} ↗
                  </a>
                ) : (
                  <span className="text-[11px] uppercase tracking-[0.14em] text-dim md:text-right">Sin emitir</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SolicitudForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [assetType, setAssetType] = useState<AssetKey>("inmueble");
  const [contractHash, setContractHash] = useState<string | null>(null);
  // El panel lateral se actualiza mientras se escribe, como en el diseno.
  const [valuacion, setValuacion] = useState("");
  const [cantidad, setCantidad] = useState("");
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
      setValuacion("");
      setCantidad("");
      setDone(true);
      await onCreated();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setStep(null);
    }
  }

  const certificados = Math.max(0, Math.floor(Number(cantidad) || 0));
  const montoValuado = Number(valuacion) || 0;
  // El precio es consecuencia: repartir la valuacion entre los certificados.
  // Se redondea a centavos, que es el grano con el que despues se cobra en USDC.
  const precio = certificados > 0 && montoValuado > 0 ? Math.round((montoValuado / certificados) * 100) / 100 : 0;
  const totalEmision = certificados * precio;
  // Lo que el redondeo del centavo deja fuera de la valuacion declarada.
  const desvio = montoValuado > 0 ? totalEmision - montoValuado : 0;

  return (
    <form onSubmit={submit} className="grid gap-3 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.62fr)]">
      <div className="grid content-start gap-5 rounded-card bg-surface px-6 py-6 shadow-card md:grid-cols-2">
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
          <Input
            name="valuacion_usd"
            required
            type="number"
            min={1}
            step="any"
            placeholder="1000000"
            value={valuacion}
            onChange={(e) => setValuacion(e.target.value)}
          />
        </Field>
        <Field label="Cantidad de certificados">
          <Input
            name="cantidad"
            required
            type="number"
            min={1}
            step={1}
            placeholder="10000"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        </Field>
        <Field
          label="Precio por certificado (USDC)"
          hint="Se calcula solo: valuación ÷ cantidad de certificados."
        >
          <input type="hidden" name="precio_usdc" value={precio || ""} />
          <div className="flex h-11 w-full items-center rounded-pill bg-surface-2 px-4 text-[15px] tabular-nums text-bone">
            {precio > 0 ? formatUsdcMoney(usdcToBase(precio)) : <span className="text-dim">—</span>}
          </div>
        </Field>
        <Field label="Contrato de fideicomiso firmado (PDF)" hint="Su hash sha256 queda grabado en el token">
          <Input
            name="contrato"
            type="file"
            accept="application/pdf"
            required
            className={FILE_INPUT}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setContractHash(file ? await sha256Hex(file) : null);
            }}
          />
        </Field>
        {contractHash && (
          <p className="break-all text-[11px] tracking-[0.04em] text-dim md:col-span-2">sha256: {contractHash}</p>
        )}
        {Math.abs(desvio) >= 0.01 && (
          <div className="md:col-span-2">
            <Notice tone="warning">
              Por el redondeo al centavo, la emisión suma {formatMoney(totalEmision)} contra una valuación de{" "}
              {formatMoney(montoValuado)}. Ajustá la cantidad de certificados si querés que cierre exacto.
            </Notice>
          </div>
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
          <Button type="submit" className="h-12 w-full md:w-auto" loading={step !== null} disabled={precio <= 0}>
            {step ?? "Enviar a auditoría"}
          </Button>
        </div>
      </div>

      <aside className="flex flex-col rounded-card bg-surface px-6 py-6 shadow-card">
        <Kicker>La emisión, en vivo</Kicker>
        <div className="mt-3.5 text-[clamp(32px,5vw,60px)] font-medium leading-[0.98] tracking-[-0.01em] tabular-nums text-acid">
          {certificados > 0 ? formatInt(certificados) : "—"}
        </div>
        <div className="mt-2 text-[11.5px] uppercase tracking-[0.14em] text-mute">Cuotapartes a emitir</div>

        <div className="mt-7">
          <DataRow k="Bien" v={ASSET_LABELS[assetType]} />
          <DataRow k="Valuación" v={valuacion ? formatMoney(Number(valuacion)) : "—"} />
          <DataRow k="Precio por certificado" v={precio > 0 ? formatUsdcMoney(usdcToBase(precio)) : "—"} />
          <DataRow k="Total de la emisión" v={totalEmision > 0 ? `${formatMoney(totalEmision)} USDC` : "—"} />
          <DataRow k="Honorario fiduciario" v={`${HONORARIO_PCT}% de cada distribución`} />
          <DataRow k="Contrato" v={contractHash ? "Cargado · sha256 calculado" : "Sin cargar"} />
        </div>

        <div className="mt-auto pt-7 text-[11px] leading-[1.7] tracking-[0.02em] text-dim">
          El fiduciario controla título, gravámenes y tasación antes de emitir. Nada sale a mercado sin ese control.
        </div>
      </aside>
    </form>
  );
}
