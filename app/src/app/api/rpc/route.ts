import { fail } from "@/lib/server/http";

// Proxy JSON-RPC hacia el endpoint de devnet (Triton): la key no se expone en el browser.
const ALLOWED_METHODS = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlockHeight",
  "getEpochInfo",
  "getFeeForMessage",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getSlot",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getTokenLargestAccounts",
  "getTransaction",
  "isBlockhashValid",
  "sendTransaction",
  "simulateTransaction",
]);

type JsonRpcCall = { method?: unknown };

export async function POST(request: Request) {
  const body: JsonRpcCall | JsonRpcCall[] = await request.json();
  const calls = Array.isArray(body) ? body : [body];
  if (calls.some((call) => typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method))) {
    return fail(403, "Metodo RPC no permitido");
  }
  const upstream = await fetch(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
