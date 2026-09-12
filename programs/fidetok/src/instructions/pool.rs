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
    events::SwapEjecutado,
    program::Fidetok,
    state::{Config, Fideicomiso, Pool, Residency, SwapSide, WhitelistEntry, WhitelistKind},
    utils::{check_usdc_peg, load_whitelist, quote_buy, quote_sell, transfer_cp_with_hook},
};

#[derive(Accounts)]
pub struct CreatePool<'info> {
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
        seeds = [FIDEICOMISO_SEED, mint.key().as_ref()],
        bump = fideicomiso.bump,
        has_one = mint
    )]
    pub fideicomiso: Box<Account<'info, Fideicomiso>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED, mint.key().as_ref()],
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// El pool es una cuenta de la plataforma: entra a la whitelist para poder operar con el hook.
    #[account(
        init,
        payer = admin,
        space = 8 + WhitelistEntry::INIT_SPACE,
        seeds = [WHITELIST_SEED, pool.key().as_ref()],
        bump
    )]
    pub pool_whitelist: Box<Account<'info, WhitelistEntry>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub pool_cp_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
        associated_token::token_program = usdc_token_program
    )]
    pub pool_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_pool(ctx: Context<CreatePool>, spread_bps: u16) -> Result<()> {
    require!(spread_bps <= MAX_SPREAD_BPS, FideTokError::SpreadInvalido);
    let pool_key = ctx.accounts.pool.key();
    ctx.accounts.pool.set_inner(Pool {
        fideicomiso: ctx.accounts.fideicomiso.key(),
        mint: ctx.accounts.mint.key(),
        spread_bps,
        bump: ctx.bumps.pool,
    });
    ctx.accounts.pool_whitelist.set_inner(WhitelistEntry {
        wallet: pool_key,
        kyc_commitment: [0u8; 32],
        residency: Residency::Argentina,
        kind: WhitelistKind::Protocolo,
        revoked: false,
        approved_at: Clock::get()?.unix_timestamp,
        bump: ctx.bumps.pool_whitelist,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
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
    #[account(seeds = [POOL_SEED, mint.key().as_ref()], bump = pool.bump, has_one = mint)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = admin,
        token::token_program = usdc_token_program
    )]
    pub admin_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = fideicomiso,
        associated_token::token_program = usdc_token_program
    )]
    pub usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub pool_cp_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
        associated_token::token_program = usdc_token_program
    )]
    pub pool_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
}

/// El fiduciario suscribe certificados al precio de emision para el inventario del pool
/// (paga al vault del fideicomiso) y deposita USDC para las recompras.
pub fn handle_add_liquidity(
    ctx: Context<AddLiquidity>,
    cp_amount: u64,
    usdc_amount: u64,
) -> Result<()> {
    require!(
        cp_amount > 0 || usdc_amount > 0,
        FideTokError::MontoInvalido
    );
    let accounts = &ctx.accounts;
    require!(
        !accounts.fideicomiso.transfers_locked,
        FideTokError::TransferenciasBloqueadas
    );
    let usdc_decimals = accounts.usdc_mint.decimals;
    let mut new_sold = accounts.fideicomiso.sold;

    if cp_amount > 0 {
        new_sold = new_sold
            .checked_add(cp_amount)
            .ok_or(FideTokError::Overflow)?;
        require!(
            new_sold <= accounts.fideicomiso.max_supply,
            FideTokError::SupplyExcedido
        );
        let cost = cp_amount
            .checked_mul(accounts.fideicomiso.price_per_token)
            .ok_or(FideTokError::Overflow)?;
        transfer_checked(
            CpiContext::new(
                accounts.usdc_token_program.key(),
                TransferChecked {
                    from: accounts.admin_usdc_account.to_account_info(),
                    mint: accounts.usdc_mint.to_account_info(),
                    to: accounts.usdc_vault.to_account_info(),
                    authority: accounts.admin.to_account_info(),
                },
            ),
            cost,
            usdc_decimals,
        )?;

        let mint_key = accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[FIDEICOMISO_SEED, mint_key.as_ref(), &[accounts.fideicomiso.bump]]];
        mint_to(
            CpiContext::new_with_signer(
                accounts.token_program.key(),
                MintTo {
                    mint: accounts.mint.to_account_info(),
                    to: accounts.pool_cp_vault.to_account_info(),
                    authority: accounts.fideicomiso.to_account_info(),
                },
                signer_seeds,
            ),
            cp_amount,
        )?;
    }

    if usdc_amount > 0 {
        transfer_checked(
            CpiContext::new(
                accounts.usdc_token_program.key(),
                TransferChecked {
                    from: accounts.admin_usdc_account.to_account_info(),
                    mint: accounts.usdc_mint.to_account_info(),
                    to: accounts.pool_usdc_vault.to_account_info(),
                    authority: accounts.admin.to_account_info(),
                },
            ),
            usdc_amount,
            usdc_decimals,
        )?;
    }

    ctx.accounts.fideicomiso.sold = new_sold;
    Ok(())
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = usdc_mint)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        seeds = [FIDEICOMISO_SEED, mint.key().as_ref()],
        bump = fideicomiso.bump,
        has_one = mint
    )]
    pub fideicomiso: Box<Account<'info, Fideicomiso>>,
    #[account(seeds = [POOL_SEED, mint.key().as_ref()], bump = pool.bump, has_one = mint)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: whitelist del usuario; puede no existir y se valida en el handler.
    #[account(seeds = [WHITELIST_SEED, user.key().as_ref()], bump)]
    pub user_whitelist: UncheckedAccount<'info>,
    #[account(seeds = [WHITELIST_SEED, pool.key().as_ref()], bump = pool_whitelist.bump)]
    pub pool_whitelist: Box<Account<'info, WhitelistEntry>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_cp_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = user,
        token::token_program = usdc_token_program
    )]
    pub user_usdc_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub pool_cp_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
        associated_token::token_program = usdc_token_program
    )]
    pub pool_usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: cuenta PriceUpdateV2 de Pyth (USDC/USD); se valida en `check_usdc_peg`.
    pub price_update: UncheckedAccount<'info>,
    /// CHECK: programa del transfer hook; se valida por direccion.
    #[account(address = HOOK_PROGRAM_ID)]
    pub hook_program: UncheckedAccount<'info>,
    /// CHECK: lista de cuentas extra del hook para este mint.
    #[account(
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
        seeds::program = HOOK_PROGRAM_ID
    )]
    pub extra_account_metas: UncheckedAccount<'info>,
    pub fidetok_program: Program<'info, Fidetok>,
    pub token_program: Program<'info, Token2022>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Flujo 4: el pool compra o vende certificados al NAV publicado +/- spread,
/// con Pyth USDC/USD como guardia. Las transferencias de CP pasan por el transfer hook.
pub fn handle_swap(
    ctx: Context<Swap>,
    side: SwapSide,
    cp_amount: u64,
    limit_usdc: u64,
) -> Result<()> {
    require!(cp_amount > 0, FideTokError::MontoInvalido);
    let accounts = &ctx.accounts;
    check_usdc_peg(&accounts.price_update.to_account_info(), &accounts.config)?;
    require!(
        !accounts.fideicomiso.transfers_locked,
        FideTokError::TransferenciasBloqueadas
    );
    let whitelist = load_whitelist(&accounts.user_whitelist.to_account_info())?;
    if accounts.fideicomiso.restrict_foreign {
        require!(
            whitelist.residency != Residency::Extranjero,
            FideTokError::ExtranjeroNoPermitido
        );
    }

    let nav = accounts.fideicomiso.nav_per_token;
    let spread_bps = accounts.pool.spread_bps;
    let usdc_decimals = accounts.usdc_mint.decimals;
    let mint_key = accounts.mint.key();
    let pool_seeds: &[&[&[u8]]] = &[&[POOL_SEED, mint_key.as_ref(), &[accounts.pool.bump]]];
    let hook_accounts = [
        accounts.hook_program.to_account_info(),
        accounts.extra_account_metas.to_account_info(),
        accounts.fidetok_program.to_account_info(),
        accounts.user_whitelist.to_account_info(),
        accounts.pool_whitelist.to_account_info(),
        accounts.fideicomiso.to_account_info(),
    ];

    let usdc_amount = match side {
        SwapSide::Vender => {
            let usdc_out = quote_sell(cp_amount, nav, spread_bps)?;
            require!(usdc_out >= limit_usdc, FideTokError::LimiteDePrecio);
            require!(
                accounts.pool_usdc_vault.amount >= usdc_out,
                FideTokError::LiquidezInsuficiente
            );
            transfer_cp_with_hook(
                &accounts.token_program.to_account_info(),
                &accounts.user_cp_account.to_account_info(),
                &accounts.mint.to_account_info(),
                &accounts.pool_cp_vault.to_account_info(),
                &accounts.user.to_account_info(),
                &hook_accounts,
                cp_amount,
                &[],
            )?;
            transfer_checked(
                CpiContext::new_with_signer(
                    accounts.usdc_token_program.key(),
                    TransferChecked {
                        from: accounts.pool_usdc_vault.to_account_info(),
                        mint: accounts.usdc_mint.to_account_info(),
                        to: accounts.user_usdc_account.to_account_info(),
                        authority: accounts.pool.to_account_info(),
                    },
                    pool_seeds,
                ),
                usdc_out,
                usdc_decimals,
            )?;
            usdc_out
        }
        SwapSide::Comprar => {
            let usdc_in = quote_buy(cp_amount, nav, spread_bps)?;
            require!(usdc_in <= limit_usdc, FideTokError::LimiteDePrecio);
            require!(
                accounts.pool_cp_vault.amount >= cp_amount,
                FideTokError::LiquidezInsuficiente
            );
            transfer_checked(
                CpiContext::new(
                    accounts.usdc_token_program.key(),
                    TransferChecked {
                        from: accounts.user_usdc_account.to_account_info(),
                        mint: accounts.usdc_mint.to_account_info(),
                        to: accounts.pool_usdc_vault.to_account_info(),
                        authority: accounts.user.to_account_info(),
                    },
                ),
                usdc_in,
                usdc_decimals,
            )?;
            transfer_cp_with_hook(
                &accounts.token_program.to_account_info(),
                &accounts.pool_cp_vault.to_account_info(),
                &accounts.mint.to_account_info(),
                &accounts.user_cp_account.to_account_info(),
                &accounts.pool.to_account_info(),
                &hook_accounts,
                cp_amount,
                pool_seeds,
            )?;
            usdc_in
        }
    };

    emit!(SwapEjecutado {
        fideicomiso: accounts.fideicomiso.key(),
        user: accounts.user.key(),
        side,
        cp_amount,
        usdc_amount,
        nav,
    });
    Ok(())
}
