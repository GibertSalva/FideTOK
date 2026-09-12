import Link from "next/link";

import { Card, LegalTag } from "@/components/ui";
import { explorer, FIDETOK_PROGRAM, HOOK_PROGRAM } from "@/lib/config";

const FLUJOS = [
  {
    n: "01",
    title: "Originación",
    legal: "CCyC · AFIP",
    body: "El fiduciante sube el contrato firmado. Recién con los papeles auditados el fiduciario emite el token, que lleva grabados on-chain el CUIT del fideicomiso, el registro del activo y el hash del contrato.",
  },
  {
    n: "02",
    title: "KYC y whitelist",
    legal: "UIF · Ley 26.737",
    body: "DNI, prueba de vida y origen de fondos. La wallet entra a la whitelist del contrato solo con KYC aprobado, y on-chain queda un hash, nunca datos personales. Si el activo es rural, los extranjeros quedan afuera.",
  },
  {
    n: "03",
    title: "Suscripción",
    legal: "CNV",
    body: "El inversor compra certificados de participación con USDC. El contrato valida la whitelist antes de acuñar.",
  },
  {
    n: "04",
    title: "Liquidez privada",
    legal: "CNV · oferta privada",
    body: "Salida anticipada contra un pool que cotiza al valor cuotaparte. Un transfer hook de Token-2022 rechaza cualquier transferencia a una wallet sin KYC: el certificado nunca sale del entorno privado.",
  },
  {
    n: "05",
    title: "Distribución de renta",
    legal: "AFIP",
    body: "Alquileres, cosechas o cobranzas se reparten en USDC en proporción a los certificados. Cada pago deja un recibo on-chain y el reporte fiscal sale en un clic.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-20">
      <section className="flex flex-col items-start gap-6 pt-6">
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/5 px-3 py-1 text-xs font-medium text-emerald-300">
          Córdoba Hack 2026 · Track Solana / Superteam AR
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-white md:text-5xl">
          Fideicomisos tokenizados, con la ley escrita en el código.
        </h1>
        <p className="max-w-2xl text-lg text-slate-400">
          Inmuebles, campos o carteras de créditos convertidos en certificados de participación que solo circulan entre
          inversores verificados. KYC, oferta privada y reporte fiscal resueltos en el contrato, no en una planilla.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/mercado"
            className="inline-flex h-11 items-center rounded-xl bg-emerald-400 px-5 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
          >
            Ver fideicomisos
          </Link>
          <Link
            href="/originador"
            className="inline-flex h-11 items-center rounded-xl border border-line bg-panel-2 px-5 text-sm font-semibold text-slate-100 hover:border-slate-500"
          >
            Tokenizar un activo
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-sm font-medium uppercase tracking-widest text-slate-500">Cinco flujos, cinco barreras legales</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FLUJOS.map((flujo) => (
            <Card key={flujo.n} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-slate-500">{flujo.n}</span>
                <LegalTag>{flujo.legal}</LegalTag>
              </div>
              <h3 className="text-lg font-semibold text-white">{flujo.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{flujo.body}</p>
            </Card>
          ))}
          <Card className="flex flex-col justify-between gap-4 border-emerald-400/20 bg-emerald-400/[0.03]">
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold text-white">En la red</h3>
              <p className="text-sm text-slate-400">
                Dos programas en Solana devnet. El segundo es el cerrojo: se ejecuta en cada transferencia.
              </p>
            </div>
            <div className="flex flex-col gap-2 font-mono text-xs">
              <a className="truncate text-emerald-300 hover:underline" href={explorer.address(FIDETOK_PROGRAM)} target="_blank" rel="noreferrer">
                fidetok · {FIDETOK_PROGRAM}
              </a>
              <a className="truncate text-emerald-300 hover:underline" href={explorer.address(HOOK_PROGRAM)} target="_blank" rel="noreferrer">
                fidetok_hook · {HOOK_PROGRAM}
              </a>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
