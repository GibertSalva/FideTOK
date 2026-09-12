"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";

import {
  IconFiduciario,
  IconMercado,
  IconPortafolio,
  IconTokenizar,
  IconVerificacion,
} from "@/components/icons";
import { ROL_LABEL, roleChip, useRol, type Rol } from "@/components/roles";
import { cn } from "@/components/ui";
import { WalletButton } from "@/components/wallet-button";

type Item = { href: string; label: string; Icono: (p: SVGProps<SVGSVGElement> & { size?: number }) => React.ReactElement };

const MERCADO: Item = { href: "/mercado", label: "Mercado", Icono: IconMercado };
const CARTERA: Item = { href: "/portafolio", label: "Cartera", Icono: IconPortafolio };
const HABILITACION: Item = { href: "/kyc", label: "Habilitación", Icono: IconVerificacion };
const EMISIONES: Item = { href: "/originador", label: "Emisiones", Icono: IconTokenizar };
const ADMINISTRACION: Item = { href: "/admin", label: "Administración", Icono: IconFiduciario };

/** Cada rol ve solo lo que puede operar. Sin rol definido, las dos puertas de entrada. */
const NAV: Record<Rol | "visitante", Item[]> = {
  inversor: [MERCADO, CARTERA, HABILITACION],
  fiduciante: [MERCADO, EMISIONES],
  administrador: [ADMINISTRACION, MERCADO],
  visitante: [MERCADO, HABILITACION, EMISIONES],
};

export function Navbar() {
  const pathname = usePathname();
  const { rol } = useRol();
  const links = NAV[rol ?? "visitante"];

  return (
    <header className="sticky top-0 z-30 bg-ink">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center gap-4 px-6 py-4 sm:px-10 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6 lg:px-14">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="block size-3.5 rounded-md bg-acid" />
          <span className="font-display text-[19px] tracking-[-0.01em]">FIDETOK</span>
        </Link>

        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto lg:order-none lg:w-auto">
          {links.map(({ href, label, Icono }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-pill px-3.5 py-2 text-[13px] transition-colors",
                  active ? "bg-surface-2 text-acid" : "text-mute hover:text-bone",
                )}
              >
                <Icono size={16} className={active ? "opacity-100" : "opacity-70"} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {rol && (
            <span className={cn("hidden sm:inline-flex", roleChip(rol))}>{ROL_LABEL[rol]}</span>
          )}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
