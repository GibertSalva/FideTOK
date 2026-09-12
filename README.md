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
- `client/`: SDK TypeScript. Cliente generado por Codama en `src/generated`, helpers en `src/lib` y scripts de devnet en `src/scripts`.
- `deployments/devnet.json`: direcciones del deploy (lo escribe `pnpm seed`).

## Comandos

Compilar **siempre** con `--arch v0`. Anchor 1.2 compila en SBPFv3 por defecto, y SBPFv3 está inactivo en devnet y mainnet. Por la misma razón, los tests se corren con `cargo test` y no con `anchor test`.

```sh
anchor build --arch v0
cargo test -p fidetok_hook --test test_flujos
cd client && pnpm install && pnpm codegen && pnpm check
```

Deploy a devnet (necesita ~12 SOL de pico entre buffer y rent):

```sh
solana config set --url devnet
anchor deploy --provider.cluster devnet
cd client && cp ../.env.local.example .env.local && pnpm seed --demo
pnpm attack <MINT_DEL_FIDEICOMISO>
```

Los keypairs de los programas (`target/deploy/*-keypair.json`) definen los program IDs y no se commitean: hacé backup y compartilos por un canal seguro.
