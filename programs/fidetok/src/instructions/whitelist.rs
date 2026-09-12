use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::FideTokError,
    events::{InversorHabilitado, InversorRevocado},
    state::{Config, Residency, WhitelistEntry, WhitelistKind},
};

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddToWhitelist<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ FideTokError::NoAutorizado
    )]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + WhitelistEntry::INIT_SPACE,
        seeds = [WHITELIST_SEED, wallet.as_ref()],
        bump
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
    pub system_program: Program<'info, System>,
}

/// Flujo 2 (UIF): la wallet entra a la whitelist solo despues de aprobar el KYC off-chain.
pub fn handle_add_to_whitelist(
    ctx: Context<AddToWhitelist>,
    wallet: Pubkey,
    kyc_commitment: [u8; 32],
    residency: Residency,
) -> Result<()> {
    ctx.accounts.whitelist_entry.set_inner(WhitelistEntry {
        wallet,
        kyc_commitment,
        residency,
        kind: WhitelistKind::Inversor,
        revoked: false,
        approved_at: Clock::get()?.unix_timestamp,
        bump: ctx.bumps.whitelist_entry,
    });
    emit!(InversorHabilitado { wallet, residency });
    Ok(())
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RevokeWhitelist<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ FideTokError::NoAutorizado
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [WHITELIST_SEED, wallet.as_ref()],
        bump = whitelist_entry.bump
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,
}

pub fn handle_revoke_whitelist(ctx: Context<RevokeWhitelist>, wallet: Pubkey) -> Result<()> {
    ctx.accounts.whitelist_entry.revoked = true;
    emit!(InversorRevocado { wallet });
    Ok(())
}
