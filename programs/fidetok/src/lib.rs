pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("CqtJAJUo7MyE25UpVEfMP8NBJUFMDY5UKn4foUsGbVcG");

#[program]
pub mod fidetok {
    use super::*;

    /// Configuracion global. Solo la upgrade authority del programa; designa al fiduciario (admin).
    pub fn init_config(
        ctx: Context<InitConfig>,
        admin: Pubkey,
        max_oracle_age_secs: u64,
        max_depeg_bps: u16,
    ) -> Result<()> {
        instructions::config::handle_init_config(ctx, admin, max_oracle_age_secs, max_depeg_bps)
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        max_oracle_age_secs: u64,
        max_depeg_bps: u16,
    ) -> Result<()> {
        instructions::config::handle_update_config(ctx, max_oracle_age_secs, max_depeg_bps)
    }

    /// Flujo 1: emite el mint Token-2022 del fideicomiso con metadata legal y transfer hook.
    pub fn create_fideicomiso(
        ctx: Context<CreateFideicomiso>,
        args: CreateFideicomisoArgs,
    ) -> Result<()> {
        instructions::create_fideicomiso::handle_create_fideicomiso(ctx, args)
    }

    /// Publica el valor cuotaparte (NAV) que usa el pool de liquidez.
    pub fn update_nav(ctx: Context<UpdateNav>, nav_per_token: u64) -> Result<()> {
        instructions::update_nav::handle_update_nav(ctx, nav_per_token)
    }

    /// Flujo 2: habilita una wallet con KYC aprobado.
    pub fn add_to_whitelist(
        ctx: Context<AddToWhitelist>,
        wallet: Pubkey,
        kyc_commitment: [u8; 32],
        residency: Residency,
    ) -> Result<()> {
        instructions::whitelist::handle_add_to_whitelist(ctx, wallet, kyc_commitment, residency)
    }

    pub fn revoke_whitelist(ctx: Context<RevokeWhitelist>, wallet: Pubkey) -> Result<()> {
        instructions::whitelist::handle_revoke_whitelist(ctx, wallet)
    }

    /// Flujo 3: suscripcion primaria de certificados con USDC.
    pub fn buy_primary(ctx: Context<BuyPrimary>, cp_amount: u64, max_usdc: u64) -> Result<()> {
        instructions::buy_primary::handle_buy_primary(ctx, cp_amount, max_usdc)
    }

    /// Flujo 4: pool de liquidez privado cotizado al NAV.
    pub fn create_pool(ctx: Context<CreatePool>, spread_bps: u16) -> Result<()> {
        instructions::pool::handle_create_pool(ctx, spread_bps)
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        cp_amount: u64,
        usdc_amount: u64,
    ) -> Result<()> {
        instructions::pool::handle_add_liquidity(ctx, cp_amount, usdc_amount)
    }

    pub fn swap(
        ctx: Context<Swap>,
        side: SwapSide,
        cp_amount: u64,
        limit_usdc: u64,
    ) -> Result<()> {
        instructions::pool::handle_swap(ctx, side, cp_amount, limit_usdc)
    }

    /// Flujo 5: distribucion de renta con tipo de cambio declarado.
    pub fn start_distribution(
        ctx: Context<StartDistribution>,
        total_usdc: u64,
        ars_per_usd: u64,
        fx_source: FxSource,
        fx_timestamp: i64,
    ) -> Result<()> {
        instructions::distribution::handle_start_distribution(
            ctx,
            total_usdc,
            ars_per_usd,
            fx_source,
            fx_timestamp,
        )
    }

    /// Paga la parte de un tenedor. La firma el admin (reparto en lote) o el propio tenedor (claim).
    pub fn pay_dividend(ctx: Context<PayDividend>) -> Result<()> {
        instructions::distribution::handle_pay_dividend(ctx)
    }

    pub fn close_distribution(ctx: Context<CloseDistribution>) -> Result<()> {
        instructions::distribution::handle_close_distribution(ctx)
    }
}
