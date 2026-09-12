// Prepara FideTOK en devnet: USDC mock + faucet, configuracion global y (opcional) fideicomisos demo.
// Uso: pnpm seed [--demo]
// La wallet de SOLANA_WALLET_PATH tiene que ser la upgrade authority de fidetok (quien deployo).
// ADMIN_WALLET (opcional) designa al fiduciario (la wallet de Phantom); por defecto es la misma wallet.
import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import {
  address,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { getCreateAccountInstruction, getTransferSolInstruction } from "@solana-program/system";
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

type Client = Awaited<ReturnType<typeof createFideTokClient>>;

const BPF_LOADER_UPGRADEABLE = address("BPFLoaderUpgradeab1e11111111111111111111111");
const USDC = 1_000_000n;
const SOL = 1_000_000_000n;
const APP_URL = process.env.APP_URL ?? "https://fidetok.vercel.app";
const DEPLOYMENTS = new URL("../../../deployments/", import.meta.url);
// Keypair del faucet (mint authority del USDC mock). Esta gitignoreado: va a FAUCET_KEYPAIR en la app.
const FAUCET_FILE = new URL("faucet-keypair.json", DEPLOYMENTS);

async function main() {
  const client = await createFideTokClient();
  const payer = client.payer;
  const admin: Address = process.env.ADMIN_WALLET ? address(process.env.ADMIN_WALLET) : payer.address;
  const [config] = await findConfigPda();
  await mkdir(DEPLOYMENTS, { recursive: true });
  console.log(`Deployer: ${payer.address}\nAdmin (fiduciario): ${admin}`);

  const faucet = await loadOrCreateFaucet();
  console.log(`Faucet: ${faucet.address}`);

  const existing = await fetchMaybeConfig(client.rpc, config);
  let usdcMint: Address;
  if (existing.exists) {
    usdcMint = existing.data.usdcMint;
    console.log(`Config ya inicializada (USDC ${usdcMint}).`);
  } else {
    usdcMint = process.env.USDC_MINT ? address(process.env.USDC_MINT) : await createMockUsdc(client, faucet);
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

  // SOL para que el faucet patrocine fees y USDC mock para el fiduciario (liquidez y distribuciones).
  // 0,5 SOL por wallet alcanza para la demo y entra en lo que deja el deploy (~1,5 SOL).
  const funding = SOL / 2n;
  const { value: faucetBalance } = await client.rpc.getBalance(faucet.address).send();
  const fund: Instruction[] =
    faucetBalance < funding / 2n ? [getTransferSolInstruction({ source: payer, destination: faucet.address, amount: funding })] : [];
  if (!process.env.USDC_MINT) {
    const [adminUsdc] = await findAssociatedTokenPda({ owner: admin, mint: usdcMint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    fund.push(
      getCreateAssociatedTokenIdempotentInstruction({ payer, owner: admin, mint: usdcMint, ata: adminUsdc }),
      getMintToInstruction({ mint: usdcMint, token: adminUsdc, mintAuthority: faucet, amount: 1_000_000n * USDC }),
    );
  }
  // El fiduciario (Phantom) paga el rent de fideicomisos, whitelists, pools y distribuciones.
  if (admin !== payer.address) {
    const { value: adminBalance } = await client.rpc.getBalance(admin).send();
    if (adminBalance < funding / 2n) fund.push(getTransferSolInstruction({ source: payer, destination: admin, amount: funding }));
  }
  if (fund.length > 0) console.log(`Fondeo de faucet y fiduciario: ${explorerTx(await send(client, fund))}`);

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
    faucet: faucet.address,
    pythUsdcUsd: PYTH_USDC_USD_PRICE_ACCOUNT,
    demoMints: mints,
  };
  await writeFile(new URL("devnet.json", DEPLOYMENTS), JSON.stringify(deployment, null, 2) + "\n");
  console.log("\nListo: deployments/devnet.json");
  console.log("\nPara app/.env.local (y Vercel):");
  console.log(`  NEXT_PUBLIC_USDC_MINT=${usdcMint}`);
  console.log(`  ADMIN_WALLET=${admin}`);
  console.log("  FAUCET_KEYPAIR=<contenido de deployments/faucet-keypair.json>");
}

/** Keypair dedicado del faucet: se genera una vez y se guarda en formato Solana CLI (64 bytes). */
async function loadOrCreateFaucet(): Promise<KeyPairSigner> {
  const exists = await access(FAUCET_FILE).then(
    () => true,
    () => false,
  );
  if (exists) {
    const bytes = JSON.parse(await readFile(FAUCET_FILE, "utf8")) as number[];
    return createKeyPairSignerFromBytes(Uint8Array.from(bytes));
  }
  const secret = randomBytes(32);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(secret, true);
  const keypair = [...secret, ...getAddressEncoder().encode(signer.address)];
  await writeFile(FAUCET_FILE, JSON.stringify(keypair), { mode: 0o600 });
  return signer;
}

async function createMockUsdc(client: Client, faucet: KeyPairSigner): Promise<Address> {
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const lamports = await client.rpc.getMinimumBalanceForRentExemption(space).send();
  const ixs = [
    getCreateAccountInstruction({ payer: client.payer, newAccount: mint, lamports, space, programAddress: TOKEN_PROGRAM_ADDRESS }),
    getInitializeMint2Instruction({ mint: mint.address, decimals: USDC_DECIMALS, mintAuthority: faucet.address }),
  ];
  console.log(`USDC mock ${mint.address}: ${explorerTx(await send(client, ixs))}`);
  return mint.address;
}

async function createDemoFideicomiso(
  client: Client,
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
    contratoUri: `${APP_URL}/verificar/${mint.address}`,
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
