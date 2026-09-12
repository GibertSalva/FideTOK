use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const FIDEICOMISO_SEED: &[u8] = b"fideicomiso";

#[constant]
pub const WHITELIST_SEED: &[u8] = b"whitelist";

#[constant]
pub const POOL_SEED: &[u8] = b"pool";

#[constant]
pub const DISTRIBUTION_SEED: &[u8] = b"distribution";

#[constant]
pub const PAYOUT_SEED: &[u8] = b"payout";

/// Seed de la cuenta con las cuentas extra del transfer hook (interface SPL).
#[constant]
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

/// Programa `fidetok_hook`. Va por constante para no crear una dependencia circular entre crates.
#[constant]
pub const HOOK_PROGRAM_ID: Pubkey = pubkey!("Dtu3n9sQwYX9ibEU81q5hbP2VRN5XoWpuMLi2NuUCfqm");

/// Los certificados de participacion son indivisibles: 1 token = 1 CP.
#[constant]
pub const CP_DECIMALS: u8 = 0;

pub const BPS_DENOMINATOR: u64 = 10_000;

/// Spread maximo del pool: 10%.
#[constant]
pub const MAX_SPREAD_BPS: u16 = 1_000;

/// Desvio maximo configurable de USDC contra el dolar: 10%.
#[constant]
pub const MAX_DEPEG_LIMIT_BPS: u16 = 1_000;

/// Variacion maxima del NAV por publicacion: 50%, para frenar errores de tipeo.
#[constant]
pub const MAX_NAV_CHANGE_BPS: u64 = 5_000;

/// Intervalo de confianza maximo aceptado del oraculo: 1% del precio.
#[constant]
pub const MAX_ORACLE_CONF_BPS: u64 = 100;

/// Programa Pyth Solana Receiver: owner de las cuentas `PriceUpdateV2` (devnet y mainnet).
#[constant]
pub const PYTH_RECEIVER_PROGRAM_ID: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

/// Discriminator Anchor de `PriceUpdateV2` = sha256("account:PriceUpdateV2")[..8].
pub const PRICE_UPDATE_V2_DISCRIMINATOR: [u8; 8] = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];

/// Feed Pyth `Crypto.USDC/USD` (el feed id es el mismo en todos los clusters).
pub const USDC_USD_FEED_ID: [u8; 32] = [
    0xea, 0xa0, 0x20, 0xc6, 0x1c, 0xc4, 0x79, 0x71, 0x28, 0x13, 0x46, 0x1c, 0xe1, 0x53, 0x89, 0x4a,
    0x96, 0xa6, 0xc0, 0x0b, 0x21, 0xed, 0x0c, 0xfc, 0x27, 0x98, 0xd1, 0xf9, 0xa9, 0xe9, 0xc9, 0x4a,
];

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;
pub const MAX_FIELD_LEN: usize = 64;
