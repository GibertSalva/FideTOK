import Link from "next/link";

import { RoleHome } from "@/components/role-home";
import { Display, Kicker } from "@/components/ui";
import { shortAddress } from "@/lib/format";
import { explorer, FIDETOK_PROGRAM, HOOK_PROGRAM } from "@/lib/config";

const FLUJOS = [
  {
    n: "01",
    title: "Originación",
    legal: "CCyC · AFIP",
    body: "El fiduciante sube el contrato firmado. Recién con los papeles auditados el fiduciario emite el token.",
  },
  {
    n: "02",
    title: "KYC y whitelist",
    legal: "UIF · Ley 26.737",
    body: "DNI, prueba de vida y origen de fondos. On-chain queda un hash, nunca datos personales.",
  },
  {
    n: "03",
    title: "Suscripción",
    legal: "CNV",
    body: "El inversor compra certificados con USDC. El contrato valida la whitelist antes de acuñar.",
  },
  {
    n: "04",
    title: "Liquidez privada",
    legal: "CNV · oferta privada",
    body: "Salida anticipada contra un pool al valor cuotaparte. El transfer hook rechaza cualquier wallet sin KYC.",
  },
  {
    n: "05",
    title: "Distribución de renta",
    legal: "AFIP",
    body: "La renta se reparte en USDC según los certificados. Cada pago deja un recibo on-chain.",
  },
];

const PUERTAS = [
  {
    n: "01",
    href: "/originador",
    title: (
      <>
        Traigo
        <br />
        un bien
      </>
    ),
    body: "Soy fiduciante. Cargo el legajo del inmueble, del campo o de la cartera, defino la emisión y lo mando a revisión del fiduciario.",
    cta: "Entrar al legajo →",
  },
  {
    n: "02",
    href: "/mercado",
    title: (
      <>
        Quiero
        <br />
        invertir
      </>
    ),
    body: "Soy inversor. Verifico mi identidad, declaro el origen de los fondos, conecto la wallet y suscribo cuotapartes.",
    cta: "Ver el mercado →",
  },
];

export default function Home() {
  return (
    <RoleHome>
      <div className="flex flex-1 flex-col">
      <div className="max-w-[1040px] pt-10">
        <Display size="hero" as="h1">
          Un bien real,
          <br />
          mil dueños
          <br />
          posibles.
        </Display>
        <p className="mt-6 max-w-[620px] text-[13.5px] leading-[1.7] tracking-[0.02em] text-mute">
          De un lado se carga el bien y se estructura el fideicomiso. Del otro se verifica la identidad y se suscriben
          cuotapartes. Elegí por dónde entrar.
        </p>
      </div>

      <div className="mt-12 grid gap-3 md:grid-cols-2">
        {PUERTAS.map((p) => (
          <Link
            key={p.n}
            href={p.href}
            className="flex min-h-[280px] flex-col rounded-card bg-surface px-8 pb-9 pt-8 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised"
          >
            <div className="text-[12px] uppercase tracking-[0.2em] text-acid">{p.n}</div>
            <Display size="xl" className="mt-4.5 !leading-[0.95]">
              {p.title}
            </Display>
            <p className="mt-4.5 max-w-md text-[12.5px] leading-[1.7] tracking-[0.02em] text-mute">{p.body}</p>
            <div className="mt-auto pt-6 text-[12px] uppercase tracking-[0.18em] text-acid">{p.cta}</div>
          </Link>
        ))}
      </div>

      <div className="pb-5 pt-12">
        <Kicker>Cinco flujos, cinco barreras legales</Kicker>
      </div>
      <div className="flex flex-col gap-2 pb-6">
        {FLUJOS.map((flujo) => (
          <div
            key={flujo.n}
            className="grid items-start gap-5 rounded-card bg-surface px-6 py-5 shadow-card md:grid-cols-[44px_minmax(0,1fr)_minmax(0,1.6fr)_180px]"
          >
            <div className="text-[12px] font-semibold text-mute">{flujo.n}</div>
            <Display size="xs" as="h3">
              {flujo.title}
            </Display>
            <p className="text-[12.5px] leading-[1.7] tracking-[0.03em] text-mute">{flujo.body}</p>
            <div className="text-[11px] uppercase tracking-[0.16em] text-dim md:text-right">{flujo.legal}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 pb-6 md:grid-cols-2">
        <div className="min-w-0 rounded-card bg-surface px-8 py-7 shadow-card">
          <Kicker>En la red · Solana devnet</Kicker>
          <p className="mt-3 max-w-md text-[12.5px] leading-[1.7] tracking-[0.03em] text-mute">
            Dos programas. El segundo es el cerrojo: se ejecuta en cada transferencia.
          </p>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-3 rounded-card bg-surface px-8 py-7 shadow-card">
          <a className="text-[12px] tracking-[0.06em] text-acid hover:underline" href={explorer.address(FIDETOK_PROGRAM)} target="_blank" rel="noreferrer">
            fidetok · {shortAddress(FIDETOK_PROGRAM, 6)}
          </a>
          <a className="text-[12px] tracking-[0.06em] text-acid hover:underline" href={explorer.address(HOOK_PROGRAM)} target="_blank" rel="noreferrer">
            fidetok_hook · {shortAddress(HOOK_PROGRAM, 6)}
          </a>
        </div>
      </div>
      </div>
    </RoleHome>
  );
}
