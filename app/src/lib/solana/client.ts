import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";

import { APP_URL, CHAIN, WS_URL } from "../config";

/**
 * Cliente Kit del browser: la wallet conectada (Wallet Standard) paga y firma,
 * y el RPC pasa por el proxy /api/rpc para no exponer la key de Triton.
 * En el servidor el plugin de wallet queda inerte (status 'pending').
 */
export function createBrowserClient() {
  const origin = typeof window === "undefined" ? APP_URL : window.location.origin;
  return createClient()
    .use(walletSigner({ chain: CHAIN }))
    .use(solanaRpc({ rpcUrl: `${origin}/api/rpc`, rpcSubscriptionsUrl: WS_URL }));
}

export type FideTokClient = ReturnType<typeof createBrowserClient>;
