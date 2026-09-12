import { fidetok } from "@fidetok/client";
import {
  fetchMaybeToken,
  findAssociatedTokenPda,
  getTokenDecoder,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import type {
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
} from "@solana/kit";

import { PYTH_USDC_USD } from "../config";

export type ReadRpc = Rpc<GetAccountInfoApi & GetMultipleAccountsApi>;

export function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/** Estado on-chain del fideicomiso (vendidos, NAV, bloqueo por distribucion...). */
export async function fetchFideicomisoState(rpc: ReadRpc, mint: Address) {
  const [address] = await fidetok.findFideicomisoPda({ mint });
  const account = await fidetok.fetchMaybeFideicomiso(rpc, address);
  return account.exists ? { address, ...account.data } : null;
}

export async function fetchTokenBalance(rpc: ReadRpc, owner: Address, mint: Address, tokenProgram: Address) {
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram });
  const token = await fetchMaybeToken(rpc, ata);
  return token.exists ? token.data.amount : 0n;
}

/** Pool de liquidez del fideicomiso y sus reservas. */
export async function fetchPoolState(rpc: ReadRpc, mint: Address, usdcMint: Address, usdcTokenProgram: Address) {
  const [address] = await fidetok.findPoolPda({ mint });
  const pool = await fidetok.fetchMaybePool(rpc, address);
  if (!pool.exists) return null;
  const [cpReserve, usdcReserve] = await Promise.all([
    fetchTokenBalance(rpc, address, mint, TOKEN_2022_PROGRAM_ADDRESS),
    fetchTokenBalance(rpc, address, usdcMint, usdcTokenProgram),
  ]);
  return { address, spreadBps: pool.data.spreadBps, cpReserve, usdcReserve };
}

/** Tenedores de certificados de un mint (para calcular el reparto de renta). */
/**
 * Tenedores de certificados de un mint.
 *
 * No se puede barrer con `getProgramAccounts` sobre Token-2022: los RPC excluyen ese
 * programa de los indices secundarios y responden -32010. Se resuelve al reves, desde
 * los candidatos: el transfer hook exige whitelist en cada transferencia, asi que
 * ningun tenedor puede estar fuera de `owners`. Se derivan sus ATAs y se leen de a
 * lotes con `getMultipleAccounts`, que si esta indexado.
 */
export async function fetchHolders(rpc: ReadRpc, mint: Address, owners: Address[]) {
  if (owners.length === 0) return [];
  const atas = await Promise.all(
    owners.map(async (owner) => {
      const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
      return ata;
    }),
  );

  const decoder = getTokenDecoder();
  const holders: Array<{ address: Address; owner: Address; amount: bigint }> = [];
  // getMultipleAccounts admite 100 cuentas por llamada.
  for (let i = 0; i < atas.length; i += 100) {
    const lote = atas.slice(i, i + 100);
    const { value } = await rpc.getMultipleAccounts(lote, { encoding: "base64" }).send();
    value.forEach((account, j) => {
      if (!account) return;
      const token = decoder.decode(base64ToBytes(account.data[0]));
      if (token.amount > 0n) holders.push({ address: lote[j], owner: token.owner, amount: token.amount });
    });
  }
  return holders;
}

/**
 * Precio Pyth USDC/USD leido de la cuenta patrocinada (mismo layout que valida el programa):
 * discriminator(8) + write_authority(32) + verification(1) + feed_id(32) + price + conf + exponent + publish_time.
 */
export async function fetchUsdcOracle(rpc: ReadRpc) {
  const { value } = await rpc.getAccountInfo(PYTH_USDC_USD, { encoding: "base64" }).send();
  if (!value) return null;
  const bytes = base64ToBytes(value.data[0]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const message = 41;
  const exponent = view.getInt32(message + 48, true);
  const scale = 10 ** exponent;
  const publishTime = Number(view.getBigInt64(message + 52, true));
  return {
    price: Number(view.getBigInt64(message + 32, true)) * scale,
    conf: Number(view.getBigUint64(message + 40, true)) * scale,
    publishTime,
    ageSeconds: Math.max(0, Math.round(Date.now() / 1000 - publishTime)),
    fullyVerified: bytes[40] === 1,
  };
}
