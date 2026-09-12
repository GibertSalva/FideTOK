"use client";

import { useConnect, useConnectedWallet, useWallets, useWalletStatus } from "@solana/kit-plugin-wallet/react";
import { useState, useSyncExternalStore } from "react";

import { useFideTok, useSession } from "@/components/providers";
import { Button } from "@/components/ui";
import { shortAddress } from "@/lib/format";
import { describeError } from "@/lib/solana/errors";

export function WalletButton() {
  const client = useFideTok();
  const { me, login, logout } = useSession();
  const status = useWalletStatus(client);
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const { dispatch: connect, isRunning: connecting } = useConnect(client);
  const [open, setOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // false en el servidor y durante la hidratacion: el estado de la wallet solo existe en el browser.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted || status === "pending" || status === "reconnecting") {
    return <div className="h-10 w-36 animate-pulse rounded-xl bg-white/5" />;
  }

  const sessionWallet = me?.session?.wallet;
  const address = connected?.account.address;

  if (address && sessionWallet === address) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-xl border border-line bg-panel-2 px-3 py-2 font-mono text-xs text-slate-200">
          {me?.session?.isAdmin && <span className="mr-2 text-amber-300">FIDUCIARIO</span>}
          {shortAddress(address)}
        </span>
        <Button variant="ghost" onClick={() => void logout()}>
          Salir
        </Button>
      </div>
    );
  }

  if (address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
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
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    );
  }

  return (
    <div className="relative">
      <Button loading={connecting} onClick={() => setOpen((value) => !value)}>
        Conectar wallet
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-line bg-panel p-2 shadow-2xl">
          {wallets.length === 0 ? (
            <a
              className="block rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
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
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/5"
                onClick={() => {
                  setOpen(false);
                  connect(wallet);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wallet.icon} alt="" className="size-6 rounded-md" />
                {wallet.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
