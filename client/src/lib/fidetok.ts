import { AccountRole, address, type Address, type Instruction, type TransactionSigner } from "@solana/kit";
import {
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";

import { FIDETOK_PROGRAM_ADDRESS, findFideicomisoPda, findWhitelistEntryPda } from "../generated/fidetok/index.js";
import { FIDETOK_HOOK_PROGRAM_ADDRESS, findExtraAccountMetaListPda } from "../generated/fidetok_hook/index.js";

/** Cuenta Pyth USDC/USD patrocinada (shard 0). Misma direccion en devnet y mainnet. */
export const PYTH_USDC_USD_PRICE_ACCOUNT = address("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX");
export const USDC_DECIMALS = 6;
/** 1 token = 1 certificado de participacion. */
export const CP_DECIMALS = 0;

/** Cuentas extra que exige el transfer hook de FideTOK para mover certificados. */
export async function getTransferHookAccounts(input: {
  mint: Address;
  sourceOwner: Address;
  destinationOwner: Address;
}) {
  const [[sourceWhitelist], [destinationWhitelist], [fideicomiso], [extraAccountMetaList]] = await Promise.all([
    findWhitelistEntryPda({ wallet: input.sourceOwner }),
    findWhitelistEntryPda({ wallet: input.destinationOwner }),
    findFideicomisoPda({ mint: input.mint }),
    findExtraAccountMetaListPda({ mint: input.mint }),
  ]);
  return [
    FIDETOK_PROGRAM_ADDRESS,
    sourceWhitelist,
    destinationWhitelist,
    fideicomiso,
    FIDETOK_HOOK_PROGRAM_ADDRESS,
    extraAccountMetaList,
  ].map((account) => ({ address: account, role: AccountRole.READONLY }));
}

/** Transferencia directa de certificados (Token-2022) con las cuentas que valida el hook. */
export async function getTransferCpInstruction(input: {
  mint: Address;
  owner: TransactionSigner;
  destinationOwner: Address;
  amount: bigint | number;
}): Promise<Instruction> {
  const [[source], [destination]] = await Promise.all([
    findAssociatedTokenPda({ owner: input.owner.address, mint: input.mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }),
    findAssociatedTokenPda({ owner: input.destinationOwner, mint: input.mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }),
  ]);
  const transfer = getTransferCheckedInstruction({
    source,
    mint: input.mint,
    destination,
    authority: input.owner,
    amount: input.amount,
    decimals: CP_DECIMALS,
  });
  const hookAccounts = await getTransferHookAccounts({
    mint: input.mint,
    sourceOwner: input.owner.address,
    destinationOwner: input.destinationOwner,
  });
  return { ...transfer, accounts: [...transfer.accounts, ...hookAccounts] };
}

/** sha256 de un archivo (contrato) para grabar en el fideicomiso y verificar despues. */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}
