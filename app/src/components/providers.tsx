"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import { toBase64 } from "@/lib/format";
import { createBrowserClient, type FideTokClient } from "@/lib/solana/client";

export type Rol = "inversor" | "originador";
export type KycStatus = "pendiente" | "aprobado" | "rechazado";

export type Me = {
  session: { wallet: string; isAdmin: boolean } | null;
  profile: { rol: Rol } | null;
  kyc: { status: KycStatus; residente_ar: boolean } | null;
};

type SessionContextValue = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const NO_SESSION: Me = { session: null, profile: null, kyc: null };

const ClientContext = createContext<FideTokClient | null>(null);
const SessionContext = createContext<SessionContextValue | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createBrowserClient);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setMe(await api<Me>("/api/auth/me").catch(() => NO_SESSION));
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<Me>("/api/auth/me")
      .catch(() => NO_SESSION)
      .then((value) => {
        if (cancelled) return;
        setMe(value);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Login: la wallet firma un mensaje (no una transaccion) y el servidor abre la sesion.
  const login = useCallback(async () => {
    const connected = client.wallet.getState().connected;
    if (!connected) throw new Error("Conecta una wallet primero");
    const { message, challenge } = await api<{ message: string; challenge: string }>("/api/auth/nonce", {
      json: { wallet: connected.account.address },
    });
    const signature = await client.wallet.signMessage(new TextEncoder().encode(message));
    await api("/api/auth/verify", { json: { challenge, signature: toBase64(signature) } });
    await refresh();
  }, [client, refresh]);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    await client.wallet.disconnect().catch(() => undefined);
    await refresh();
  }, [client, refresh]);

  return (
    <ClientContext value={client}>
      <SessionContext value={{ me, loading, refresh, login, logout }}>{children}</SessionContext>
    </ClientContext>
  );
}

export function useFideTok() {
  const client = useContext(ClientContext);
  if (!client) throw new Error("useFideTok fuera de <Providers>");
  return client;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession fuera de <Providers>");
  return value;
}
