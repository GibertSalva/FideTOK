"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "@/components/providers";
import { cn } from "@/components/ui";
import { WalletButton } from "@/components/wallet-button";

export function Navbar() {
  const { me } = useSession();
  const pathname = usePathname();
  const links = [
    { href: "/mercado", label: "Mercado" },
    { href: "/portafolio", label: "Portafolio" },
    { href: "/kyc", label: "Verificación" },
    { href: "/originador", label: "Tokenizar" },
    ...(me?.session?.isAdmin ? [{ href: "/admin", label: "Fiduciario" }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white">
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-400 text-sm font-bold text-slate-950">F</span>
            FideTOK
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname.startsWith(link.href) ? "bg-white/5 text-white" : "text-slate-400 hover:text-white",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
