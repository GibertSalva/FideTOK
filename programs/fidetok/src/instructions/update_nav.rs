use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::FideTokError,
    events::NavActualizado,
    state::{Config, Fideicomiso},
};

#[derive(Accounts)]
pub struct UpdateNav<'info> {
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ FideTokError::NoAutorizado
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [FIDEICOMISO_SEED, fideicomiso.mint.as_ref()],
        bump = fideicomiso.bump
    )]
    pub fideicomiso: Account<'info, Fideicomiso>,
}

pub fn handle_update_nav(ctx: Context<UpdateNav>, nav_per_token: u64) -> Result<()> {
    require!(nav_per_token > 0, FideTokError::MontoInvalido);
    let fideicomiso = &mut ctx.accounts.fideicomiso;
    let previous = fideicomiso.nav_per_token;

    let change_bps = u128::from(previous.abs_diff(nav_per_token))
        .checked_mul(u128::from(BPS_DENOMINATOR))
        .ok_or(FideTokError::Overflow)?
        .checked_div(u128::from(previous))
        .ok_or(FideTokError::Overflow)?;
    require!(
        change_bps <= u128::from(MAX_NAV_CHANGE_BPS),
        FideTokError::NavFueraDeRango
    );

    fideicomiso.nav_per_token = nav_per_token;
    fideicomiso.nav_updated_at = Clock::get()?.unix_timestamp;

    emit!(NavActualizado {
        fideicomiso: fideicomiso.key(),
        nav_anterior: previous,
        nav_nuevo: nav_per_token,
    });
    Ok(())
}
