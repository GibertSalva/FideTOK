"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useSession } from "@/components/providers";
import { RequireSession } from "@/components/require-session";
import { Badge, Button, Card, Field, Input, LegalTag, Notice, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { describeError } from "@/lib/solana/errors";
import { uploadFile } from "@/lib/upload";

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
        title="Verificación de identidad"
        subtitle="Para invertir en fideicomisos necesitamos validar tu identidad y el origen de tus fondos. Tus datos quedan cifrados fuera de la blockchain: on-chain solo va un hash."
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
      <Card className="flex flex-col items-start gap-3">
        <Badge tone="success">KYC aprobado</Badge>
        <h2 className="text-lg font-semibold text-white">Tu wallet está habilitada</h2>
        <p className="text-sm text-slate-400">
          El fiduciario agregó tu wallet a la whitelist del contrato. Ya podés suscribir certificados y recibir renta.
        </p>
        <Link href="/mercado" className="text-sm font-semibold text-emerald-300 hover:underline">
          Ir al mercado →
        </Link>
      </Card>
    );
  }
  if (status === "pendiente") {
    return (
      <Card className="flex flex-col items-start gap-3">
        <Badge tone="warning">En revisión</Badge>
        <h2 className="text-lg font-semibold text-white">Recibimos tu documentación</h2>
        <p className="text-sm text-slate-400">
          El fiduciario cruza tus datos contra los padrones de riesgo. Cuando lo apruebe, tu wallet entra a la whitelist
          y vas a poder invertir.
        </p>
      </Card>
    );
  }
  return <KycForm rejected={status === "rechazado"} onDone={refresh} />;
}

function KycForm({ rejected, onDone }: { rejected: boolean; onDone: () => Promise<void> }) {
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          residente_ar: data.get("residente_ar") === "on",
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
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="grid gap-5 md:grid-cols-2">
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
        <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
          <input type="checkbox" name="residente_ar" defaultChecked className="size-4 accent-emerald-400" />
          Soy residente en la Argentina
        </label>
        <Field label="DNI — frente">
          <Input name="dni_frente" type="file" accept="image/*,application/pdf" required className="pt-2" />
        </Field>
        <Field label="DNI — dorso">
          <Input name="dni_dorso" type="file" accept="image/*,application/pdf" required className="pt-2" />
        </Field>
        <Field label="Prueba de vida" hint="Una selfie sosteniendo tu DNI. En el celular abre la cámara.">
          <Input name="selfie" type="file" accept="image/*" capture="user" required className="pt-2" />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-300 md:col-span-2">
          <input type="checkbox" required className="mt-0.5 size-4 accent-emerald-400" />
          Declaro bajo juramento que los fondos provienen de actividades lícitas y que los datos son verdaderos.
        </label>
        {error && (
          <div className="md:col-span-2">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        <div className="md:col-span-2">
          <Button type="submit" loading={step !== null}>
            {step ?? "Enviar verificación"}
          </Button>
        </div>
      </Card>
      <Card className="flex h-fit flex-col gap-3 text-sm text-slate-400">
        <h3 className="font-semibold text-white">Qué pasa con tus datos</h3>
        <p>Los documentos van a un almacenamiento privado al que solo accede el fiduciario.</p>
        <p>
          On-chain solo se guarda <span className="font-mono text-slate-300">sha256(DNI | CUIT | secreto)</span>: prueba
          que tu wallet pasó el KYC sin exponer quién sos.
        </p>
        <p>Si el activo es rural, la Ley de Tierras no permite inversores extranjeros: la residencia se valida en el contrato.</p>
      </Card>
    </form>
  );
}
