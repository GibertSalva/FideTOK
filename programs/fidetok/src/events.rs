use anchor_lang::prelude::*;

use crate::state::{AssetType, Residency, SwapSide};

#[event]
pub struct FideicomisoCreado {
    pub fideicomiso: Pubkey,
    pub mint: Pubkey,
    pub asset_type: AssetType,
    pub max_supply: u64,
    pub price_per_token: u64,
}

#[event]
pub struct InversorHabilitado {
    pub wallet: Pubkey,
    pub residency: Residency,
}

#[event]
pub struct InversorRevocado {
    pub wallet: Pubkey,
}

#[event]
pub struct Suscripcion {
    pub fideicomiso: Pubkey,
    pub investor: Pubkey,
    pub cp_amount: u64,
    pub usdc_paid: u64,
}

#[event]
pub struct NavActualizado {
    pub fideicomiso: Pubkey,
    pub nav_anterior: u64,
    pub nav_nuevo: u64,
}

#[event]
pub struct SwapEjecutado {
    pub fideicomiso: Pubkey,
    pub user: Pubkey,
    pub side: SwapSide,
    pub cp_amount: u64,
    pub usdc_amount: u64,
    pub nav: u64,
}

#[event]
pub struct DistribucionIniciada {
    pub distribution: Pubkey,
    pub fideicomiso: Pubkey,
    pub total_usdc: u64,
    pub supply_snapshot: u64,
    pub ars_per_usd: u64,
}

#[event]
pub struct DividendoPagado {
    pub distribution: Pubkey,
    pub holder: Pubkey,
    pub tokens: u64,
    pub amount: u64,
}

#[event]
pub struct DistribucionCerrada {
    pub distribution: Pubkey,
    pub paid_usdc: u64,
    pub devuelto: u64,
}
