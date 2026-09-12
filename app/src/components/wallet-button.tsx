"use client";

import { useConnect, useConnectedWallet, useWallets, useWalletStatus } from "@solana/kit-plugin-wallet/react";
import { useState, useSyncExternalStore } from "react";

import { IconWallet } from "@/components/icons";
import { useFideTok, useSession } from "@/components/providers";
import { ROL_LABEL, roleChip, useRol } from "@/components/roles";
import { Button, cn } from "@/components/ui";
import { shortAddress } from "@/lib/format";
import { describeError } from "@/lib/solana/errors";

/** Circulito de identidad: el color sale de la propia direccion. */
function Avatar({ address, className }: { address: string; className?: string }) {
  const hue = [...address].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 360, 7);
  return (
    <span
      className={cn("block size-6 shrink-0 rounded-full", className)}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 58%), hsl(${(hue + 48) % 360} 60% 44%))` }}
    />
  );
}

export function WalletButton() {
  const client = useFideTok();
  const { me, login, logout } = useSession();
  const { rol } = useRol();
  const status = useWalletStatus(client);
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const { dispatch: connect, isRunning: connecting } = useConnect(client);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // false en el servidor y durante la hidratacion: el estado de la wallet solo existe en el browser.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted || status === "pending" || status === "reconnecting") {
    return <div className="h-10 w-36 animate-pulse rounded-pill bg-surface" />;
  }

  const sessionWallet = me?.session?.wallet;
  const address = connected?.account.address;

  // Sesion abierta: una sola pastilla con la direccion, y los roles en el menu.
  if (address && sessionWallet === address) {
    return (
      <div className="relative">
        <button
          onClick={() => setMenu((v) => !v)}
          className="flex items-center gap-2.5 rounded-pill bg-surface-2 py-1.5 pl-1.5 pr-4 text-[13px] text-bone transition-colors hover:bg-surface-3"
        >
          <Avatar address={address} />
          {shortAddress(address)}
        </button>

        {menu && (
          <div className="absolute right-0 z-20 mt-2 w-60 rounded-card bg-surface p-4 shadow-raised">
            <div className="flex items-center gap-2.5">
              <Avatar address={address} className="size-8" />
              <span className="text-[13px]">{shortAddress(address, 6)}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {rol ? (
                <span className={cn("inline-flex", roleChip(rol))}>{ROL_LABEL[rol]}</span>
              ) : (
                <span className="inline-flex items-center rounded-pill bg-surface-2 px-3 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-mute">
                  Sin rol asignado
                </span>
              )}
            </div>

            <button
              onClick={() => {
                setMenu(false);
                void logout();
              }}
              className="mt-4 w-full rounded-pill bg-surface-2 py-2.5 text-[12px] uppercase tracking-[0.14em] text-mute transition-colors hover:bg-surface-3 hover:text-bone"
            >
              Salir
            </button>
          </div>
        )}
      </div>
    );
  }

  // Wallet conectada pero sin firmar el ingreso.
  if (address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          className="h-10"
          loading={signing}
          onClick={async () => {
            setError(null);
            setSigning(true);
            try {
              await login();
            } catch (e) {
              setError(describeError(e));
            } finally {
              setSigning(false);
            }
          }}
        >
          Ingresar con {shortAddress(address)}
        </Button>
        {error && <span className="text-[11px] text-down">{error}</span>}
      </div>
    );
  }

  return (
    <div className="relative">
      <Button className="h-10" loading={connecting} onClick={() => setOpen((value) => !value)}>
        {!connecting && <IconWallet size={16} />}
        Conectar wallet
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-card bg-surface p-1.5 shadow-raised">
          {wallets.length === 0 ? (
            <a
              className="block rounded-pill px-3 py-2 text-[12px] tracking-[0.06em] text-mute hover:bg-surface-2 hover:text-acid"
              href="https://phantom.com/download"
              target="_blank"
              rel="noreferrer"
            >
              No encontramos wallets. Instalá Phantom →
            </a>
          ) : (
            wallets.map((wallet) => (
              <button
                key={wallet.name}
                className="flex w-full items-center gap-3 rounded-pill px-3 py-2 text-left text-[13px] text-bone hover:bg-surface-2"
                onClick={() => {
                  setOpen(false);
                  connect(wallet);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wallet.icon} alt="" className="size-5 rounded-md" />
                {wallet.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
