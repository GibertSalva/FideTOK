use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{
        mint_to, transfer_checked, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::{
    constants::*,
    error::FideTokError,
    events::Suscripcion,
    state::{Config, Fideicomiso, Residency},
    utils::{check_usdc_peg, load_whitelist},
};

#[derive(Accounts)]
pub struct BuyPrimary<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [FIDEICOMISO_SEED, mint.key().as_ref()],
        bump = fideicomiso.bump,
        has_one = mint
    )]
    pub fideicomiso: Box<Account<'info, Fideicomiso>>,
    /// CHECK: whitelist del inversor; puede no existir y se valida en el handler.
    #[account(seeds = [WHITELIST_SEED, investor.key().as_ref()], bump)]
    pub investor_whitelist: UncheckedAccount<'info>,
    #[account(mut, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = investor,
        associated_token::mint = mint,
        associated_token::authority = investor,
        associated_token::token_program = token_program
    )]
    pub investor_cp_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = investor,
        token::token_program = usdc_token_program
    )]
    pub investor_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = fideicomiso,
        associated_token::token_program = usdc_token_program
    )]
    pub usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: cuenta PriceUpdateV2 de Pyth (USDC/USD); se valida en `check_usdc_peg`.
    pub price_update: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Flujo 3. Acunar no dispara el transfer hook, asi que KYC y Ley de Tierras se validan aca.
pub fn handle_buy_primary(ctx: Context<BuyPrimary>, cp_amount: u64, max_usdc: u64) -> Result<()> {
    require!(cp_amount > 0, FideTokError::MontoInvalido);
    let accounts = &ctx.accounts;
    check_usdc_peg(&accounts.price_update.to_account_info(), &accounts.config)?;

    let whitelist = load_whitelist(&accounts.investor_whitelist.to_account_info())?;
    let fideicomiso = &accounts.fideicomiso;
    require!(
        !fideicomiso.transfers_locked,
        FideTokError::TransferenciasBloqueadas
    );
    if fideicomiso.restrict_foreign {
        require!(
            whitelist.residency != Residency::Extranjero,
            FideTokError::ExtranjeroNoPermitido
        );
    }

    let new_sold = fideicomiso
        .sold
        .checked_add(cp_amount)
        .ok_or(FideTokError::Overflow)?;
    require!(new_sold <= fideicomiso.max_supply, FideTokError::SupplyExcedido);
    let cost = cp_amount
        .checked_mul(fideicomiso.price_per_token)
        .ok_or(FideTokError::Overflow)?;
    require!(cost <= max_usdc, FideTokError::LimiteDePrecio);

    transfer_checked(
        CpiContext::new(
            accounts.usdc_token_program.key(),
            TransferChecked {
                from: accounts.investor_usdc_account.to_account_info(),
                mint: accounts.usdc_mint.to_account_info(),
                to: accounts.usdc_vault.to_account_info(),
                authority: accounts.investor.to_account_info(),
            },
        ),
        cost,
        accounts.usdc_mint.decimals,
    )?;

    let mint_key = accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[FIDEICOMISO_SEED, mint_key.as_ref(), &[fideicomiso.bump]]];
    mint_to(
        CpiContext::new_with_signer(
            accounts.token_program.key(),
            MintTo {
                mint: accounts.mint.to_account_info(),
                to: accounts.investor_cp_account.to_account_info(),
                authority: accounts.fideicomiso.to_account_info(),
            },
            signer_seeds,
        ),
        cp_amount,
    )?;

    let fideicomiso_key = ctx.accounts.fideicomiso.key();
    let investor = ctx.accounts.investor.key();
    ctx.accounts.fideicomiso.sold = new_sold;

    emit!(Suscripcion {
        fideicomiso: fideicomiso_key,
        investor,
        cp_amount,
        usdc_paid: cost,
    });
    Ok(())
}
