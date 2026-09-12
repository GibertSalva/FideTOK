use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    error::FideTokError,
    events::{DistribucionCerrada, DistribucionIniciada, DividendoPagado},
    state::{Config, Distribution, Fideicomiso, FxSource, Payout},
};

#[derive(Accounts)]
pub struct StartDistribution<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ FideTokError::NoAutorizado,
        has_one = usdc_mint
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [FIDEICOMISO_SEED, mint.key().as_ref()],
        bump = fideicomiso.bump,
        has_one = mint
    )]
    pub fideicomiso: Box<Account<'info, Fideicomiso>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Distribution::INIT_SPACE,
        seeds = [
            DISTRIBUTION_SEED,
            fideicomiso.key().as_ref(),
            &fideicomiso.distribution_count.to_le_bytes()
        ],
        bump
    )]
    pub distribution: Box<Account<'info, Distribution>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = admin,
        token::token_program = usdc_token_program
    )]
    pub admin_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = distribution,
        associated_token::token_program = usdc_token_program
    )]
    pub distribution_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Flujo 5: el fiduciario deposita la renta en USDC y declara el tipo de cambio usado.
/// Mientras la distribucion este abierta, el hook congela las transferencias (snapshot).
pub fn handle_start_distribution(
    ctx: Context<StartDistribution>,
    total_usdc: u64,
    ars_per_usd: u64,
    fx_source: FxSource,
    fx_timestamp: i64,
) -> Result<()> {
    require!(total_usdc > 0, FideTokError::MontoInvalido);
    require!(ars_per_usd > 0, FideTokError::TipoDeCambioInvalido);
    require!(
        !ctx.accounts.fideicomiso.transfers_locked,
        FideTokError::TransferenciasBloqueadas
    );
    let supply = ctx.accounts.mint.supply;
    require!(supply > 0, FideTokError::SinTenencia);

    transfer_checked(
        CpiContext::new(
            ctx.accounts.usdc_token_program.key(),
            TransferChecked {
                from: ctx.accounts.admin_usdc_account.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.distribution_vault.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        total_usdc,
        ctx.accounts.usdc_mint.decimals,
    )?;

    let fideicomiso_key = ctx.accounts.fideicomiso.key();
    let index = ctx.accounts.fideicomiso.distribution_count;
    ctx.accounts.distribution.set_inner(Distribution {
        fideicomiso: fideicomiso_key,
        index,
        total_usdc,
        supply_snapshot: supply,
        paid_usdc: 0,
        paid_count: 0,
        ars_per_usd,
        fx_source,
        fx_timestamp,
        created_at: Clock::get()?.unix_timestamp,
        closed: false,
        bump: ctx.bumps.distribution,
    });

    let fideicomiso = &mut ctx.accounts.fideicomiso;
    fideicomiso.transfers_locked = true;
    fideicomiso.distribution_count = index.checked_add(1).ok_or(FideTokError::Overflow)?;

    emit!(DistribucionIniciada {
        distribution: ctx.accounts.distribution.key(),
        fideicomiso: fideicomiso_key,
        total_usdc,
        supply_snapshot: supply,
        ars_per_usd,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct PayDividend<'info> {
    /// El admin (reparto en lote) o el propio tenedor (claim).
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        seeds = [FIDEICOMISO_SEED, mint.key().as_ref()],
        bump = fideicomiso.bump,
        has_one = mint
    )]
    pub fideicomiso: Box<Account<'info, Fideicomiso>>,
    #[account(
        mut,
        seeds = [
            DISTRIBUTION_SEED,
            fideicomiso.key().as_ref(),
            &distribution.index.to_le_bytes()
        ],
        bump = distribution.bump,
        has_one = fideicomiso,
        constraint = !distribution.closed @ FideTokError::DistribucionCerrada
    )]
    pub distribution: Box<Account<'info, Distribution>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: wallet (o PDA del pool) duena de los certificados; se valida contra su ATA.
    pub holder: UncheckedAccount<'info>,
    #[account(
        associated_token::mint = mint,
        associated_token::authority = holder,
        associated_token::token_program = token_program
    )]
    pub holder_cp_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = usdc_mint,
        associated_token::authority = holder,
        associated_token::token_program = usdc_token_program
    )]
    pub holder_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Payout::INIT_SPACE,
        seeds = [PAYOUT_SEED, distribution.key().as_ref(), holder.key().as_ref()],
        bump
    )]
    pub payout: Box<Account<'info, Payout>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = distribution,
        associated_token::token_program = usdc_token_program
    )]
    pub distribution_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Paga `saldo * total / supply_snapshot`. El recibo `Payout` impide pagar dos veces
/// y deja el rastro fiscal on-chain (AFIP).
pub fn handle_pay_dividend(ctx: Context<PayDividend>) -> Result<()> {
    let accounts = &ctx.accounts;
    require!(
        accounts.payer.key() == accounts.config.admin
            || accounts.payer.key() == accounts.holder.key(),
        FideTokError::NoAutorizado
    );

    let tokens = accounts.holder_cp_account.amount;
    require!(tokens > 0, FideTokError::SinTenencia);
    let distribution = &accounts.distribution;
    let amount = u128::from(tokens)
        .checked_mul(u128::from(distribution.total_usdc))
        .ok_or(FideTokError::Overflow)?
        .checked_div(u128::from(distribution.supply_snapshot))
        .ok_or(FideTokError::Overflow)?;
    let amount = u64::try_from(amount).map_err(|_| FideTokError::Overflow)?;

    if amount > 0 {
        let fideicomiso_key = accounts.fideicomiso.key();
        let index_bytes = distribution.index.to_le_bytes();
        let signer_seeds: &[&[&[u8]]] = &[&[
            DISTRIBUTION_SEED,
            fideicomiso_key.as_ref(),
            &index_bytes,
            &[distribution.bump],
        ]];
        transfer_checked(
            CpiContext::new_with_signer(
                accounts.usdc_token_program.key(),
                TransferChecked {
                    from: accounts.distribution_vault.to_account_info(),
                    mint: accounts.usdc_mint.to_account_info(),
                    to: accounts.holder_usdc_account.to_account_info(),
                    authority: accounts.distribution.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            accounts.usdc_mint.decimals,
        )?;
    }

    let distribution_key = ctx.accounts.distribution.key();
    let holder = ctx.accounts.holder.key();
    ctx.accounts.payout.set_inner(Payout {
        distribution: distribution_key,
        holder,
        tokens,
        amount,
        paid_at: Clock::get()?.unix_timestamp,
        bump: ctx.bumps.payout,
    });
    let distribution = &mut ctx.accounts.distribution;
    distribution.paid_usdc = distribution
        .paid_usdc
        .checked_add(amount)
        .ok_or(FideTokError::Overflow)?;
    distribution.paid_count = distribution
        .paid_count
        .checked_add(1)
        .ok_or(FideTokError::Overflow)?;

    emit!(DividendoPagado {
        distribution: distribution_key,
        holder,
        tokens,
        amount,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseDistribution<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ FideTokError::NoAutorizado,
        has_one = usdc_mint
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [FIDEICOMISO_SEED, fideicomiso.mint.as_ref()],
        bump = fideicomiso.bump
    )]
    pub fideicomiso: Box<Account<'info, Fideicomiso>>,
    #[account(
        mut,
        seeds = [
            DISTRIBUTION_SEED,
            fideicomiso.key().as_ref(),
            &distribution.index.to_le_bytes()
        ],
        bump = distribution.bump,
        has_one = fideicomiso,
        constraint = !distribution.closed @ FideTokError::DistribucionCerrada
    )]
    pub distribution: Box<Account<'info, Distribution>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = distribution,
        associated_token::token_program = usdc_token_program
    )]
    pub distribution_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = admin,
        token::token_program = usdc_token_program
    )]
    pub admin_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
}

/// Cierra la distribucion, devuelve el remanente por redondeo y libera las transferencias.
pub fn handle_close_distribution(ctx: Context<CloseDistribution>) -> Result<()> {
    let remaining = ctx.accounts.distribution_vault.amount;
    if remaining > 0 {
        let fideicomiso_key = ctx.accounts.fideicomiso.key();
        let index_bytes = ctx.accounts.distribution.index.to_le_bytes();
        let signer_seeds: &[&[&[u8]]] = &[&[
            DISTRIBUTION_SEED,
            fideicomiso_key.as_ref(),
            &index_bytes,
            &[ctx.accounts.distribution.bump],
        ]];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.usdc_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.distribution_vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.admin_usdc_account.to_account_info(),
                    authority: ctx.accounts.distribution.to_account_info(),
                },
                signer_seeds,
            ),
            remaining,
            ctx.accounts.usdc_mint.decimals,
        )?;
    }

    ctx.accounts.distribution.closed = true;
    ctx.accounts.fideicomiso.transfers_locked = false;

    emit!(DistribucionCerrada {
        distribution: ctx.accounts.distribution.key(),
        paid_usdc: ctx.accounts.distribution.paid_usdc,
        devuelto: remaining,
    });
    Ok(())
}
