use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::{constants::*, error::FideTokError, program::Fidetok, state::Config};

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mint::token_program = usdc_token_program)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key()) @ FideTokError::NoAutorizado
    )]
    pub program: Program<'info, Fidetok>,
    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key()) @ FideTokError::NoAutorizado
    )]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_config(
    ctx: Context<InitConfig>,
    admin: Pubkey,
    max_oracle_age_secs: u64,
    max_depeg_bps: u16,
) -> Result<()> {
    validate_oracle_params(max_oracle_age_secs, max_depeg_bps)?;
    ctx.accounts.config.set_inner(Config {
        admin,
        usdc_mint: ctx.accounts.usdc_mint.key(),
        max_oracle_age_secs,
        max_depeg_bps,
        bump: ctx.bumps.config,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ FideTokError::NoAutorizado
    )]
    pub config: Account<'info, Config>,
}

pub fn handle_update_config(
    ctx: Context<UpdateConfig>,
    max_oracle_age_secs: u64,
    max_depeg_bps: u16,
) -> Result<()> {
    validate_oracle_params(max_oracle_age_secs, max_depeg_bps)?;
    let config = &mut ctx.accounts.config;
    config.max_oracle_age_secs = max_oracle_age_secs;
    config.max_depeg_bps = max_depeg_bps;
    Ok(())
}

fn validate_oracle_params(max_oracle_age_secs: u64, max_depeg_bps: u16) -> Result<()> {
    require!(max_oracle_age_secs > 0, FideTokError::ParametroInvalido);
    require!(
        max_depeg_bps > 0 && max_depeg_bps <= MAX_DEPEG_LIMIT_BPS,
        FideTokError::ParametroInvalido
    );
    Ok(())
}
