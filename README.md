# FideTOK

Tokenización de fideicomisos (inmuebles, campos, carteras de créditos) en Solana, con el cumplimiento legal argentino dentro del código. Cada certificado de participación es un token Token-2022 que solo puede circular entre inversores con KYC aprobado.

Stack del track Superteam: Anchor 1.2 + Token-2022 + `@solana/kit` v8 + Codama + LiteSVM. Reglas para agentes en `CLAUDE.md`.

## Qué barrera legal resuelve cada flujo

| Flujo | Barrera | Dónde lo resuelve el código |
|---|---|---|
| 1. Originación | CCyC (patrimonio de afectación) y AFIP | `create_fideicomiso` emite el mint con metadata on-chain: CUIT del fideicomiso, registro del activo, sha256 del contrato firmado y si aplica la Ley de Tierras. [`create_fideicomiso.rs`](programs/fidetok/src/instructions/create_fideicomiso.rs) |
| 2. KYC | UIF y Ley 26.737 | `add_to_whitelist` habilita la wallet solo después del KYC. On-chain queda un commitment `sha256(dni\|cuit\|nonce)` y la residencia, nunca datos personales. [`whitelist.rs`](programs/fidetok/src/instructions/whitelist.rs) |
| 3. Suscripción | CNV y Ley de Tierras | `buy_primary` valida la whitelist y la regla rural (acuñar no pasa por el hook). [`buy_primary.rs`](programs/fidetok/src/instructions/buy_primary.rs) |
| 4. Mercado secundario | CNV (oferta privada) | El transfer hook rechaza cualquier transferencia si origen o destino no tienen KYC, incluso desde un explorador o un exchange. [`fidetok_hook`](programs/fidetok_hook/src/lib.rs). El pool compra y vende al NAV publicado por el fiduciario, con Pyth USDC/USD como guardia. [`pool.rs`](programs/fidetok/src/instructions/pool.rs) |
| 5. Distribución | AFIP (régimen informativo) | `start_distribution` congela saldos y guarda el tipo de cambio ARS/USD declarado. `pay_dividend` deja un recibo `Payout` por tenedor. [`distribution.rs`](programs/fidetok/src/instructions/distribution.rs) |

La Ley de Tierras se activa sola cuando el activo es `Rural`: los extranjeros no pueden suscribir ni recibir esos certificados.

## Arquitectura

- **Dos programas.** `fidetok` (núcleo) y `fidetok_hook` (transfer hook). Tienen que estar separados: el swap del pool hace CPI fidetok → Token-2022 → hook, y el runtime no permite reentrada.
- **Token.** Mint Token-2022 con 0 decimales (1 token = 1 certificado). Extensiones: `TransferHook`, `MetadataPointer` y `TokenMetadata`. Mint y freeze authority = PDA del fideicomiso.
- **Pool.** Cotiza al valor cuotaparte (`update_nav`) ± spread, no es un AMM. Antes de operar lee la cuenta Pyth USDC/USD patrocinada `Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX` y se pausa si el precio está viejo o USDC se despega.
- **Distribución.** Push + claim con una sola instrucción: la firma el fiduciario en lote o el propio tenedor.

| Programa | ID (devnet) |
|---|---|
| `fidetok` | `CqtJAJUo7MyE25UpVEfMP8NBJUFMDY5UKn4foUsGbVcG` |
| `fidetok_hook` | `Dtu3n9sQwYX9ibEU81q5hbP2VRN5XoWpuMLi2NuUCfqm` |

## Estructura

- `programs/fidetok`, `programs/fidetok_hook`: programas Anchor.
- `programs/fidetok_hook/tests/test_flujos.rs`: tests E2E de los 5 flujos en LiteSVM.
- `idl/`: IDLs commiteados (Vercel no tiene `target/`).
- `client/`: SDK TypeScript (`@fidetok/client`). Cliente generado por Codama en `src/generated`, helpers en `src/lib` y scripts de devnet en `src/scripts`.
- `app/`: web en Next.js 16 (App Router). Wallet Standard vía `@solana/kit-plugin-wallet`, login firmando un mensaje, Supabase solo del lado del servidor.
- `supabase/migrations/0001_init.sql`: esquema (perfiles, KYC, solicitudes, NAV, distribuciones, pagos) y buckets privados.
- `deployments/devnet.json`: direcciones del deploy (lo escribe `pnpm seed`). El keypair del faucet queda en `deployments/faucet-keypair.json`, que está gitignoreado.

## App web

| Ruta | Rol | Flujo |
|---|---|---|
| `/originador` | Fiduciante | 1: carga el activo y el contrato firmado (el sha256 se verifica en el servidor) |
| `/kyc` | Inversor | 2: DNI, prueba de vida, origen de fondos, chequeo de riesgo |
| `/mercado`, `/mercado/[mint]` | Inversor | 3 y 4: suscripción primaria y pool al NAV con guardia Pyth |
| `/portafolio` | Inversor | 5: renta cobrada, reclamo, transferencia P2P (con la demo del cerrojo) y faucet |
| `/admin` | Fiduciario | Auditoría y emisión, whitelist, NAV y pool, distribución y CSV para AFIP |
| `/verificar/[mint]` | Público | Compara un PDF con el hash del contrato grabado en el token |

Setup:

1. Crear un proyecto en Supabase (plan Free). En el SQL Editor, correr `supabase/migrations/0001_init.sql`.
2. `cp app/.env.local.example app/.env.local` y completar: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (`openssl rand -hex 32`), `ADMIN_WALLET` (la wallet de Phantom del fiduciario), `NEXT_PUBLIC_USDC_MINT` y `FAUCET_KEYPAIR` (los dos últimos salen de `pnpm seed`).
3. `pnpm install` en la raíz y `pnpm dev`: compila el SDK y levanta Next en `http://localhost:3000`.

Deploy en Vercel: importar el repo con Root Directory `app` y cargar las mismas variables de entorno. El `build` de la app compila primero el SDK del workspace.

## Comandos

Compilar **siempre** con `--arch v0`. Anchor 1.2 compila en SBPFv3 por defecto, y SBPFv3 está inactivo en devnet y mainnet. Por la misma razón, los tests se corren con `cargo test` y no con `anchor test`.

```sh
anchor build --arch v0
cargo test -p fidetok_hook --test test_flujos
cd client && pnpm install && pnpm codegen && pnpm check
```

Deploy a devnet. El SOL de devnet es gratis: se pide en faucet.solana.com (con GitHub) o a los mentores. Con los binarios optimizados por tamaño (`opt-level = "z"`: 517 KB + 170 KB), el pico es de ~8,4 SOL: el buffer de cada deploy se devuelve al terminar y quedan ~4,8 SOL de rent de los programas. El seed usa ~2 SOL más (faucet y fiduciario).

```sh
solana config set --url devnet
solana program deploy target/deploy/fidetok_hook.so --program-id target/deploy/fidetok_hook-keypair.json
solana program deploy target/deploy/fidetok.so --program-id target/deploy/fidetok-keypair.json
cd client && cp ../.env.local.example .env.local && ADMIN_WALLET=<wallet_del_fiduciario> pnpm seed
pnpm attack <MINT_DEL_FIDEICOMISO>
```

Los keypairs de los programas (`target/deploy/*-keypair.json`) definen los program IDs y no se commitean: hacé backup y compartilos por un canal seguro.
