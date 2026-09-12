import { fidetok, fidetokHook, PYTH_USDC_USD_PRICE_ACCOUNT } from "@fidetok/client";
import { address, type Address } from "@solana/kit";

export const CHAIN = "solana:devnet" as const;
export const WS_URL = process.env.NEXT_PUBLIC_SOLANA_WS_URL ?? "wss://api.devnet.solana.com";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const FIDETOK_PROGRAM = fidetok.FIDETOK_PROGRAM_ADDRESS;
export const HOOK_PROGRAM = fidetokHook.FIDETOK_HOOK_PROGRAM_ADDRESS;
export const PYTH_USDC_USD = PYTH_USDC_USD_PRICE_ACCOUNT;

export const USDC_DECIMALS = 6;
export const USDC_UNIT = 1_000_000n;

export function usdcMint(): Address {
  const value = process.env.NEXT_PUBLIC_USDC_MINT;
  if (!value) throw new Error("Falta NEXT_PUBLIC_USDC_MINT (lo imprime `pnpm seed`)");
  return address(value);
}

export const explorer = {
  tx: (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  address: (account: string) => `https://explorer.solana.com/address/${account}?cluster=devnet`,
};

export const ASSET_LABELS = {
  inmueble: "Inmueble",
  rural: "Campo",
  creditos: "Créditos",
  otro: "Otro",
} as const;
export type AssetKey = keyof typeof ASSET_LABELS;
