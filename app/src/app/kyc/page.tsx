"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useSession } from "@/components/providers";
import { RequireSession } from "@/components/require-session";
import {
  Badge,
  Button,
  Check,
  DataRow,
  Display,
  Field,
  Input,
  Kicker,
  LegalTag,
  Notice,
  PageHeader,
  Section,
  Select,
} from "@/components/ui";
import { api } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { describeError } from "@/lib/solana/errors";
import { uploadFile } from "@/lib/upload";

const FILE_INPUT =
  "py-2 text-[11px] uppercase tracking-[0.12em] text-mute file:mr-3 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3.5 file:py-2 file:text-[11px] file:uppercase file:tracking-[0.12em] file:text-mute hover:file:bg-surface-3 hover:file:text-acid";

const ORIGENES = [
  ["salario", "Salario / honorarios"],
  ["ahorros", "Ahorros"],
  ["actividad_comercial", "Actividad comercial"],
  ["venta_bienes", "Venta de bienes"],
  ["herencia", "Herencia o donación"],
  ["otros", "Otros"],
] as const;

export default function KycPage() {
  return (
    <>
      <PageHeader
        kicker="Habilitación"
        title="Alta de inversor"
        subtitle="Validamos identidad y origen de fondos antes de habilitarte a operar. On-chain solo queda un hash."
        action={<LegalTag>UIF · Ley 26.737</LegalTag>}
      />
      <RequireSession>
        <KycContent />
      </RequireSession>
    </>
  );
}

function KycContent() {
  const { me, refresh } = useSession();
  const status = me?.kyc?.status;

  if (status === "aprobado") {
    return (
      <Section className="flex flex-col items-start gap-4">
        <Badge tone="success">Habilitado para operar</Badge>
        <Display size="lg" as="h2">
          Ya podés operar
        </Display>
        <p className="max-w-xl text-[12.5px] leading-[1.7] tracking-[0.02em] text-mute">
          El fiduciario agregó tu wallet a la whitelist del contrato. Ya podés suscribir certificados y recibir renta.
        </p>
        <Link href="/mercado" className="text-[12px] uppercase tracking-[0.18em] text-acid hover:underline">
          Ir al mercado →
        </Link>
      </Section>
    );
  }
  if (status === "pendiente") {
    return (
      <Section className="flex flex-col items-start gap-4">
        <Badge tone="warning">Alta en revisión</Badge>
        <Display size="lg" as="h2">
          Legajo presentado
        </Display>
        <p className="max-w-xl text-[12.5px] leading-[1.7] tracking-[0.02em] text-mute">
          El fiduciario cruza tus datos contra los padrones de riesgo. Cuando lo apruebe, tu wallet entra a la whitelist
          y vas a poder invertir.
        </p>
      </Section>
    );
  }
  return <KycForm rejected={status === "rechazado"} onDone={refresh} />;
}

function KycForm({ rejected, onDone }: { rejected: boolean; onDone: () => Promise<void> }) {
  const { me } = useSession();
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [residente, setResidente] = useState(true);
  const [jurada, setJurada] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const file = (name: string) => {
      const value = data.get(name);
      if (!(value instanceof File) || value.size === 0) throw new Error("Faltan documentos");
      return value;
    };
    try {
      setStep("Subiendo documentos…");
      const [dniFrente, dniDorso, selfie] = await Promise.all([
        uploadFile("kyc", "dni_frente", file("dni_frente")),
        uploadFile("kyc", "dni_dorso", file("dni_dorso")),
        uploadFile("kyc", "selfie", file("selfie")),
      ]);
      setStep("Enviando…");
      await api("/api/kyc", {
        json: {
          nombre: data.get("nombre"),
          apellido: data.get("apellido"),
          dni: data.get("dni"),
          cuit: data.get("cuit"),
          nacionalidad: data.get("nacionalidad"),
          residente_ar: residente,
          origen_fondos: data.get("origen_fondos"),
          dni_frente_path: dniFrente,
          dni_dorso_path: dniDorso,
          selfie_path: selfie,
        },
      });
      await onDone();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setStep(null);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.62fr)]">
      <div className="grid content-start gap-5 rounded-card bg-surface px-6 py-6 shadow-card md:grid-cols-2">
        {rejected && (
          <div className="md:col-span-2">
            <Notice tone="danger">Tu verificación anterior fue rechazada. Revisá los datos y volvé a enviarla.</Notice>
          </div>
        )}
        <Field label="Nombre">
          <Input name="nombre" required autoComplete="given-name" />
        </Field>
        <Field label="Apellido">
          <Input name="apellido" required autoComplete="family-name" />
        </Field>
        <Field label="DNI">
          <Input name="dni" required inputMode="numeric" placeholder="30123456" />
        </Field>
        <Field label="CUIT / CUIL" hint="Validamos el dígito verificador">
          <Input name="cuit" required inputMode="numeric" placeholder="20-30123456-7" />
        </Field>
        <Field label="Nacionalidad">
          <Input name="nacionalidad" required defaultValue="Argentina" />
        </Field>
        <Field label="Origen de los fondos">
          <Select name="origen_fondos" required defaultValue="ahorros">
            {ORIGENES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="md:col-span-2">
          <Check checked={residente} onChange={setResidente}>
            Soy residente en la Argentina. Si el activo es rural, la Ley 26.737 solo admite residentes.
          </Check>
        </div>
        <Field label="DNI — frente">
          <Input name="dni_frente" type="file" accept="image/*,application/pdf" required className={FILE_INPUT} />
        </Field>
        <Field label="DNI — dorso">
          <Input name="dni_dorso" type="file" accept="image/*,application/pdf" required className={FILE_INPUT} />
        </Field>
        <Field label="Prueba de vida" hint="Una selfie sosteniendo tu DNI. En el celular abre la cámara.">
          <Input name="selfie" type="file" accept="image/*" capture="user" required className={FILE_INPUT} />
        </Field>
        <div className="md:col-span-2">
          <Check checked={jurada} onChange={setJurada}>
            Declaro bajo juramento que los fondos provienen de actividades lícitas y que los datos son verdaderos.
          </Check>
        </div>
        {error && (
          <div className="md:col-span-2">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        <div className="md:col-span-2">
          <Button type="submit" className="h-12 w-full md:w-auto" loading={step !== null} disabled={!jurada}>
            {step ?? "Enviar verificación"}
          </Button>
        </div>
      </div>

      <aside className="flex flex-col rounded-card bg-surface px-6 py-6 shadow-card">
        <Kicker>Estado del alta</Kicker>
        <div className="mt-3.5 text-[clamp(32px,5vw,60px)] font-medium leading-[0.98] tabular-nums text-acid">
          {rejected ? "0/1" : "1/1"}
        </div>
        <div className="mt-2 text-[11.5px] uppercase tracking-[0.1em] text-mute">Legajos a presentar</div>

        <div className="mt-7">
          <DataRow k="Wallet" v={me?.session ? shortAddress(me.session.wallet) : "—"} />
          <DataRow k="Estado" v={rejected ? "Rechazado" : "Sin enviar"} />
          <DataRow k="Residencia fiscal" v={residente ? "Argentina" : "Exterior"} />
          <DataRow k="Documentos" v="DNI frente · dorso · prueba de vida" />
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-7 text-[11px] leading-[1.7] tracking-[0.02em] text-dim">
          <p>Los documentos van a un almacenamiento privado al que solo accede el fiduciario.</p>
          <p>
            On-chain solo se guarda sha256(DNI | CUIT | secreto): prueba que tu wallet pasó el KYC sin exponer quién sos.
          </p>
          <p>Si el activo es rural, la Ley de Tierras no permite inversores extranjeros.</p>
        </div>
      </aside>
    </form>
  );
}
