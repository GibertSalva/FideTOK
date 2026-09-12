import type { SVGProps } from "react";

import type { AssetKey } from "@/lib/config";

/**
 * Set propio, trazo de 1.5 sobre una grilla de 20x20.
 * Los de navegacion vienen de los artboards del rediseño; el resto sigue el mismo pulso.
 */
function Icon({ size = 18, children, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------- navegacion */

export function IconMercado(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M3 8.4 4.5 4h11L17 8.4" />
      <path d="M3.6 8.4V16h12.8V8.4" />
      <path d="M3 8.4a2.35 2.35 0 0 0 4.67 0 2.35 2.35 0 0 0 4.66 0 2.35 2.35 0 0 0 4.67 0" />
    </Icon>
  );
}

export function IconPortafolio(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <rect x="2.6" y="6" width="14.8" height="10.4" rx="2.2" />
      <path d="M7 6V4.7A1.6 1.6 0 0 1 8.6 3.1h2.8A1.6 1.6 0 0 1 13 4.7V6" />
      <path d="M2.6 10.2h14.8" />
    </Icon>
  );
}

export function IconVerificacion(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="8.4" r="5.1" />
      <path d="m7.9 8.5 1.5 1.5 2.8-3" />
      <path d="m7 13.3-.8 3.9 3.8-1.8 3.8 1.8-.8-3.9" />
    </Icon>
  );
}

export function IconTokenizar(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M11.2 2.8H6.4A1.6 1.6 0 0 0 4.8 4.4v11.2a1.6 1.6 0 0 0 1.6 1.6h7.2a1.6 1.6 0 0 0 1.6-1.6V7z" />
      <path d="M11.2 2.8V7h4" />
      <path d="M10 10.2v4M8 12.2h4" />
    </Icon>
  );
}

export function IconFiduciario(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M10 2.8 16 5.1v4.5c0 3.6-2.4 6.3-6 7.6-3.6-1.3-6-4-6-7.6V5.1z" />
      <path d="m7.5 9.8 1.8 1.8 3.3-3.5" />
    </Icon>
  );
}

/* ----------------------------------------------------------- tipos de bien */

export function IconInmueble(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M4 17V5.6A1.6 1.6 0 0 1 5.6 4h5A1.6 1.6 0 0 1 12.2 5.6V17" />
      <path d="M12.2 9.4h2.4A1.6 1.6 0 0 1 16.2 11V17" />
      <path d="M2.6 17h14.8" />
      <path d="M6.6 7.4h3M6.6 10.2h3M6.6 13h3" />
    </Icon>
  );
}

export function IconCampo(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M3 16.6h14" />
      <path d="M10 16.6V7.4" />
      <path d="M10 10.2c0-2.1 1.5-3.6 3.6-3.6 0 2.1-1.5 3.6-3.6 3.6z" />
      <path d="M10 13c0-2.1-1.5-3.6-3.6-3.6 0 2.1 1.5 3.6 3.6 3.6z" />
    </Icon>
  );
}

export function IconCreditos(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M5.2 3.4h9.6v13.2l-2.4-1.4-2.4 1.4-2.4-1.4-2.4 1.4z" />
      <path d="M7.8 7.2h4.4M7.8 10.2h4.4" />
    </Icon>
  );
}

export function IconOtro(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M3.2 6.6 10 3.2l6.8 3.4v6.8L10 16.8l-6.8-3.4z" />
      <path d="m3.2 6.6 6.8 3.4 6.8-3.4M10 10v6.8" />
    </Icon>
  );
}

/* ----------------------------------------------------------------- plata */

/** Moneda con el signo de peso: acompaña a los montos en USDC. */
export function IconUsdc(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 5.6v8.8" />
      <path d="M12.1 7.8c0-.9-.94-1.6-2.1-1.6s-2.1.7-2.1 1.6.94 1.4 2.1 1.7 2.1.8 2.1 1.7-.94 1.6-2.1 1.6-2.1-.7-2.1-1.6" />
    </Icon>
  );
}

export function IconWallet(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <rect x="2.8" y="5.2" width="14.4" height="10.4" rx="2.2" />
      <path d="M2.8 8.6h14.4" />
      <circle cx="13.8" cy="12.2" r=".9" />
    </Icon>
  );
}

export function IconRenta(props: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M3.2 13.6 7.6 9.2l2.8 2.8 5.6-5.6" />
      <path d="M12.4 6.4h3.6V10" />
    </Icon>
  );
}

const ASSET_ICONS = {
  inmueble: IconInmueble,
  rural: IconCampo,
  creditos: IconCreditos,
  otro: IconOtro,
} as const;

/** Ficha del tipo de bien: ocupa el lugar del logo de token de un mercado cripto. */
export function AssetTile({ type, size = 36 }: { type: AssetKey; size?: number }) {
  const Icono = ASSET_ICONS[type];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-pill bg-acid/12 text-acid"
      style={{ width: size, height: size }}
    >
      <Icono size={Math.round(size * 0.53)} />
    </span>
  );
}
