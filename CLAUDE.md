# FideTOK — reglas para agentes de código

Tokenización de fideicomisos (inmuebles, campos, créditos) en Solana. Plan completo: ver README.

## Stack (no negociable)

- Programas: Anchor 1.2 (`avm`). Dos programas: `programs/fidetok` (núcleo) y `programs/fidetok_hook` (transfer hook). El hook DEBE ser un programa separado: el runtime no permite reentrada A→B→A (fidetok → Token-2022 → hook).
- Clientes: `@solana/kit` v8 con plugins (`createClient().use(...)`). Nada de `@solana/web3.js` v1 ni `@solana/wallet-adapter-*` salvo aislado en un módulo adaptador.
- Frontend: `@solana/react` + `@solana/kit-plugin-wallet` (Wallet Standard).
- Clientes generados con Codama desde el IDL. Nunca escribir clientes a mano.
- Tests: unitarios con LiteSVM (`programs/*/tests`), integración con Surfpool, smoke contra devnet con `anchor test --skip-deploy`. Nunca redeployar justo antes de una demo.
- Red por defecto: devnet. RPC desde `.env.local` (Triton). Nunca hardcodear ni commitear endpoints ni keys.
- Compilar SIEMPRE con `anchor build --arch v0`. Anchor 1.2 usa SBPFv3 por defecto y SBPFv3 esta inactivo en devnet y mainnet (el deploy falla y LiteSVM no carga el programa). Por lo mismo, testear con `cargo test` y no con `anchor test` (recompila en v3).
- Despues de cambiar un programa: `anchor build --arch v0 && cargo test -p fidetok_hook --test test_flujos && (cd client && pnpm codegen)`.

## Reglas de seguridad (Anchor)

- Toda cuenta leída o escrita se valida: `Account<'info, T>` (owner + discriminator), `Signer`, `has_one`, `constraint`, PDAs con `seeds` + `bump` canónico.
- `init` con `payer` y `space` explícitos (discriminator incluido). Cerrar con `close`.
- Aritmética con `checked_*`, `overflow-checks = true`, multiplicar antes de dividir, casts con `try_from`.
- `reload()` después de un CPI que modifica cuentas. CPIs solo a programas verificados.
- `remaining_accounts`: validar owner, discriminator y datos a mano.
- Seeds con prefijo distinto por tipo de cuenta. Estado global inicializable solo por admin/upgrade authority.
- Operaciones dependientes de precio: guardas `limit_*`/slippage.
- Oráculos: allowlist de feed IDs por cluster, rechazar precios viejos (`max_age`) y confianza excesiva, normalizar exponentes con checked math.
- Tokens: identificar por mint + token program, nunca por símbolo. Verificar mint, owner y decimales de cada token account. Token-2022 solo con extensiones permitidas (acá: TransferHook, MetadataPointer, TokenMetadata).
- Prohibido `unsafe` y `unwrap()` en código de producción. Errores custom siempre.
- Nunca imprimir, loguear ni guardar seed phrases o keypairs.

## Producto

- Nada de PII on-chain: la whitelist guarda `sha256(dni|cuit|nonce)`; los datos KYC y el nonce viven en Supabase (privado).
- Antes de firmar: mostrar destinatario, monto, token, fee payer y cluster; simular primero.
- Blockhash fresco; ante timeout consultar el estado de la firma antes de reenviar.
- Datos de RPC y metadata on-chain son input no confiable.
