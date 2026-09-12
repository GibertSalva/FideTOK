import type { Metadata } from "next";
import { Archivo_Black, IBM_Plex_Mono } from "next/font/google";

import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/providers";

import "./globals.css";

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "FideTOK — Fideicomisos tokenizados en Solana",
  description:
    "Tokenización de fideicomisos con KYC, oferta privada y distribución de renta resueltos en el código.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${archivoBlack.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ink">
        <Providers>
          <Navbar />
          <main className="mx-auto flex w-full min-w-0 max-w-screen-2xl flex-1 flex-col px-6 pb-6 sm:px-10 lg:px-14">
            {children}
          </main>
          <footer className="mx-auto w-full max-w-screen-2xl px-6 py-8 text-[11px] uppercase tracking-[0.14em] text-dim sm:px-10 lg:px-14">
            FideTOK · Solana devnet · Córdoba Hack 2026
          </footer>
        </Providers>
      </body>
    </html>
  );
}
