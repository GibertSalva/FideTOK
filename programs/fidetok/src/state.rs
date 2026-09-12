use anchor_lang::prelude::*;

/// Tipo de activo subyacente del fideicomiso.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AssetType {
    Inmueble,
    Rural,
    Creditos,
    Otro,
}

impl AssetType {
    pub fn label(&self) -> &'static str {
        match self {
            AssetType::Inmueble => "inmueble",
            AssetType::Rural => "rural",
            AssetType::Creditos => "creditos",
            AssetType::Otro => "otro",
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Residency {
    Argentina,
    Extranjero,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum WhitelistKind {
    /// Persona humana o juridica con KYC aprobado.
    Inversor,
    /// Cuenta de la plataforma (p. ej. la PDA del pool de liquidez).
    Protocolo,
}

/// Fuente declarada del tipo de cambio ARS/USD de una distribucion.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum FxSource {
    OficialBna,
    Mep,
    Otro,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SwapSide {
    /// El inversor entrega certificados y recibe USDC.
    Vender,
    /// El inversor entrega USDC y recibe certificados.
    Comprar,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Wallet del fiduciario (administrador de la plataforma).
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    /// Antiguedad maxima aceptada del precio Pyth USDC/USD.
    pub max_oracle_age_secs: u64,
    /// Desvio maximo de USDC contra el dolar antes de pausar operaciones.
    pub max_depeg_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Fideicomiso {
    pub mint: Pubkey,
    /// Wallet del fiduciante que origino el fideicomiso.
    pub originador: Pubkey,
    pub asset_type: AssetType,
    /// Ley 26.737 de Tierras Rurales: sin inversores extranjeros si el activo es rural.
    pub restrict_foreign: bool,
    /// Precio de suscripcion primaria por certificado, en unidades base de USDC.
    pub price_per_token: u64,
    /// Valor cuotaparte publicado por el fiduciario, en unidades base de USDC.
    pub nav_per_token: u64,
    pub nav_updated_at: i64,
    pub max_supply: u64,
    pub sold: u64,
    pub valuation_usd: u64,
    /// sha256 del contrato de fideicomiso firmado (PDF).
    pub contract_sha256: [u8; 32],
    /// true mientras hay una distribucion abierta: congela saldos para el reparto.
    pub transfers_locked: bool,
    pub distribution_count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WhitelistEntry {
    pub wallet: Pubkey,
    /// sha256(dni | cuit | nonce). Los datos personales nunca van on-chain.
    pub kyc_commitment: [u8; 32],
    pub residency: Residency,
    pub kind: WhitelistKind,
    pub revoked: bool,
    pub approved_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub fideicomiso: Pubkey,
    pub mint: Pubkey,
    pub spread_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Distribution {
    pub fideicomiso: Pubkey,
    pub index: u32,
    pub total_usdc: u64,
    pub supply_snapshot: u64,
    pub paid_usdc: u64,
    pub paid_count: u32,
    /// Pesos por dolar con 4 decimales (1530.0000 = 15_300_000).
    pub ars_per_usd: u64,
    pub fx_source: FxSource,
    pub fx_timestamp: i64,
    pub created_at: i64,
    pub closed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Payout {
    pub distribution: Pubkey,
    pub holder: Pubkey,
    pub tokens: u64,
    pub amount: u64,
    pub paid_at: i64,
    pub bump: u8,
}
