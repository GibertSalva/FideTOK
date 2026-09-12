// Prepara FideTOK en devnet: USDC mock, configuracion global y (opcional) fideicomisos demo.
// Uso: pnpm seed [--demo]
// La wallet de SOLANA_WALLET_PATH tiene que ser la upgrade authority de fidetok (quien deployo).
// ADMIN_WALLET (opcional) designa al fiduciario; por defecto es la misma wallet.
import { mkdir, writeFile } from "node:fs/promises";

import { address, generateKeyPairSigner, getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";

import { createFideTokClient } from "../client.js";
import {
  AssetType,
  fetchMaybeConfig,
  FIDETOK_PROGRAM_ADDRESS,
  findConfigPda,
  getCreateFideicomisoInstructionAsync,
  getInitConfigInstructionAsync,
} from "../generated/fidetok/index.js";
import { FIDETOK_HOOK_PROGRAM_ADDRESS, getInitializeExtraAccountMetaListInstructionAsync } from "../generated/fidetok_hook/index.js";
import { PYTH_USDC_USD_PRICE_ACCOUNT, sha256, USDC_DECIMALS } from "../lib/fidetok.js";
import { explorerTx, send } from "../lib/send.js";

const BPF_LOADER_UPGRADEABLE = address("BPFLoaderUpgradeab1e11111111111111111111111");
const USDC = 1_000_000n;
const APP_URL = process.env.APP_URL ?? "https://fidetok.vercel.app";

async function main() {
  const client = await createFideTokClient();
  const payer = client.payer;
  const admin: Address = process.env.ADMIN_WALLET ? address(process.env.ADMIN_WALLET) : payer.address;
  const [config] = await findConfigPda();
  console.log(`Deployer: ${payer.address}\nAdmin (fiduciario): ${admin}`);

  const existing = await fetchMaybeConfig(client.rpc, config);
  let usdcMint: Address;
  if (existing.exists) {
    usdcMint = existing.data.usdcMint;
    console.log(`Config ya inicializada (USDC ${usdcMint}).`);
  } else {
    usdcMint = process.env.USDC_MINT ? address(process.env.USDC_MINT) : await createMockUsdc(client);
    const [programData] = await getProgramDerivedAddress({
      programAddress: BPF_LOADER_UPGRADEABLE,
      seeds: [getAddressEncoder().encode(FIDETOK_PROGRAM_ADDRESS)],
    });
    const init = await getInitConfigInstructionAsync({
      authority: payer,
      usdcMint,
      usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
      programData,
      admin,
      maxOracleAgeSecs: 900n,
      maxDepegBps: 200,
    });
    console.log(`init_config: ${explorerTx(await send(client, [init]))}`);
  }

  // USDC mock para el fiduciario (liquidez del pool y distribuciones de demo).
  if (!process.env.USDC_MINT) {
    const [adminUsdc] = await findAssociatedTokenPda({ owner: admin, mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const fund = [
      getCreateAssociatedTokenIdempotentInstruction({ payer, owner: admin, mint: usdcMint, ata: adminUsdc }),
      getMintToInstruction({ mint: usdcMint, token: adminUsdc, mintAuthority: payer, amount: 1_000_000n * USDC }),
    ];
    console.log(`USDC mock al fiduciario: ${explorerTx(await send(client, fund))}`);
  }

  const mints: Record<string, Address> = {};
  if (process.argv.includes("--demo")) {
    if (admin !== payer.address) throw new Error("--demo requiere que el deployer sea el admin.");
    mints.edificio = await createDemoFideicomiso(client, usdcMint, {
      name: "Edificio Nueva Cordoba",
      symbol: "FNCBA",
      assetType: AssetType.Inmueble,
      registro: "Matricula 1.234.567 - RPI Cordoba",
    });
    mints.campo = await createDemoFideicomiso(client, usdcMint, {
      name: "Campo La Esperanza",
      symbol: "FLESP",
      assetType: AssetType.Rural,
      registro: "Matricula 45.678 - Rio Cuarto",
    });
  }

  const deployment = {
    cluster: "devnet",
    fidetokProgram: FIDETOK_PROGRAM_ADDRESS,
    hookProgram: FIDETOK_HOOK_PROGRAM_ADDRESS,
    config,
    admin,
    usdcMint,
    pythUsdcUsd: PYTH_USDC_USD_PRICE_ACCOUNT,
    demoMints: mints,
  };
  await mkdir(new URL("../../../deployments/", import.meta.url), { recursive: true });
  await writeFile(new URL("../../../deployments/devnet.json", import.meta.url), JSON.stringify(deployment, null, 2) + "\n");
  console.log("Listo: deployments/devnet.json", deployment);
}

async function createMockUsdc(client: Awaited<ReturnType<typeof createFideTokClient>>): Promise<Address> {
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const lamports = await client.rpc.getMinimumBalanceForRentExemption(space).send();
  const ixs = [
    getCreateAccountInstruction({ payer: client.payer, newAccount: mint, lamports, space, programAddress: TOKEN_PROGRAM_ADDRESS }),
    getInitializeMint2Instruction({ mint: mint.address, decimals: USDC_DECIMALS, mintAuthority: client.payer.address }),
  ];
  console.log(`USDC mock ${mint.address}: ${explorerTx(await send(client, ixs))}`);
  return mint.address;
}

async function createDemoFideicomiso(
  client: Awaited<ReturnType<typeof createFideTokClient>>,
  usdcMint: Address,
  demo: { name: string; symbol: string; assetType: AssetType; registro: string },
): Promise<Address> {
  const mint = await generateKeyPairSigner();
  const contract = new TextEncoder().encode(`Contrato de fideicomiso demo: ${demo.name}`);
  const create = await getCreateFideicomisoInstructionAsync({
    admin: client.payer,
    originador: client.payer.address,
    mint,
    usdcMint,
    usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
    name: demo.name,
    symbol: demo.symbol,
    uri: `${APP_URL}/api/metadata/${mint.address}`,
    assetType: demo.assetType,
    cuitFideicomiso: "30-71234567-8",
    registro: demo.registro,
    contratoUri: `${APP_URL}/fideicomisos/${mint.address}/contrato`,
    contractSha256: await sha256(contract),
    valuationUsd: 1_000_000n,
    pricePerToken: 100n * USDC,
    maxSupply: 10_000n,
  });
  const hook = await getInitializeExtraAccountMetaListInstructionAsync({ payer: client.payer, mint: mint.address });
  console.log(`${demo.name} ${mint.address}: ${explorerTx(await send(client, [create, hook], 1_000_000))}`);
  return mint.address;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
