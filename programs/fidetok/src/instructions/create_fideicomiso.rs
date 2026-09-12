use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{
        token_metadata_initialize, token_metadata_update_field, Mint, TokenAccount,
        TokenInterface, TokenMetadataInitialize, TokenMetadataUpdateField,
    },
};
use spl_token_metadata_interface::state::{Field, TokenMetadata};

use crate::{
    constants::*,
    error::FideTokError,
    events::FideicomisoCreado,
    state::{AssetType, Config, Fideicomiso},
    utils::to_hex,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateFideicomisoArgs {
    pub name: String,
    pub symbol: String,
    /// URI del JSON de metadata (lo sirve la app).
    pub uri: String,
    pub asset_type: AssetType,
    pub cuit_fideicomiso: String,
    /// Matricula o inscripcion registral del activo, si aplica.
    pub registro: String,
    /// Enlace al contrato firmado (acceso restringido a inversores con KYC).
    pub contrato_uri: String,
    pub contract_sha256: [u8; 32],
    pub valuation_usd: u64,
    pub price_per_token: u64,
    pub max_supply: u64,
}

#[derive(Accounts)]
pub struct CreateFideicomiso<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ FideTokError::NoAutorizado,
        has_one = usdc_mint
    )]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: wallet del fiduciante; solo se registra en el fideicomiso.
    pub originador: UncheckedAccount<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Fideicomiso::INIT_SPACE,
        seeds = [FIDEICOMISO_SEED, mint.key().as_ref()],
        bump
    )]
    pub fideicomiso: Box<Account<'info, Fideicomiso>>,
    #[account(
        init,
        payer = admin,
        mint::decimals = CP_DECIMALS,
        mint::authority = fideicomiso,
        mint::freeze_authority = fideicomiso,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = fideicomiso,
        extensions::metadata_pointer::metadata_address = mint,
        extensions::transfer_hook::authority = fideicomiso,
        extensions::transfer_hook::program_id = HOOK_PROGRAM_ID,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mint::token_program = usdc_token_program)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = fideicomiso,
        associated_token::token_program = usdc_token_program
    )]
    pub usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_fideicomiso(
    ctx: Context<CreateFideicomiso>,
    args: CreateFideicomisoArgs,
) -> Result<()> {
    validate_text(&args.name, MAX_NAME_LEN)?;
    validate_text(&args.symbol, MAX_SYMBOL_LEN)?;
    validate_text(&args.uri, MAX_URI_LEN)?;
    validate_text(&args.contrato_uri, MAX_URI_LEN)?;
    validate_text(&args.cuit_fideicomiso, MAX_FIELD_LEN)?;
    require!(args.registro.len() <= MAX_FIELD_LEN, FideTokError::TextoInvalido);
    require!(
        args.max_supply > 0 && args.price_per_token > 0,
        FideTokError::MontoInvalido
    );

    let restrict_foreign = args.asset_type == AssetType::Rural;
    let mint_key = ctx.accounts.mint.key();
    let fideicomiso_key = ctx.accounts.fideicomiso.key();
    let bump = ctx.bumps.fideicomiso;

    ctx.accounts.fideicomiso.set_inner(Fideicomiso {
        mint: mint_key,
        originador: ctx.accounts.originador.key(),
        asset_type: args.asset_type,
        restrict_foreign,
        price_per_token: args.price_per_token,
        nav_per_token: args.price_per_token,
        nav_updated_at: Clock::get()?.unix_timestamp,
        max_supply: args.max_supply,
        sold: 0,
        valuation_usd: args.valuation_usd,
        contract_sha256: args.contract_sha256,
        transfers_locked: false,
        distribution_count: 0,
        bump,
    });

    // Datos legales que quedan grabados en el token (Flujo 1: CCyC + AFIP).
    let additional_metadata = vec![
        ("tipo_activo".to_string(), args.asset_type.label().to_string()),
        ("cuit_fideicomiso".to_string(), args.cuit_fideicomiso.clone()),
        ("registro".to_string(), args.registro.clone()),
        ("contrato_sha256".to_string(), to_hex(&args.contract_sha256)),
        ("contrato_uri".to_string(), args.contrato_uri.clone()),
        ("valuacion_usd".to_string(), args.valuation_usd.to_string()),
        (
            "ley_tierras".to_string(),
            if restrict_foreign { "aplica" } else { "no_aplica" }.to_string(),
        ),
    ];

    // Token-2022 agranda el mint al escribir la metadata: pre-fondeamos el rent del tamanio final.
    let metadata = TokenMetadata {
        name: args.name.clone(),
        symbol: args.symbol.clone(),
        uri: args.uri.clone(),
        additional_metadata: additional_metadata.clone(),
        ..Default::default()
    };
    let mint_info = ctx.accounts.mint.to_account_info();
    let final_len = mint_info
        .data_len()
        .checked_add(metadata.tlv_size_of()?)
        .ok_or(FideTokError::Overflow)?;
    let required_lamports = Rent::get()?.minimum_balance(final_len);
    let current_lamports = mint_info.lamports();
    if required_lamports > current_lamports {
        system_program::transfer(
            CpiContext::new(
                system_program::ID,
                system_program::Transfer {
                    from: ctx.accounts.admin.to_account_info(),
                    to: mint_info.clone(),
                },
            ),
            required_lamports - current_lamports,
        )?;
    }

    let signer_seeds: &[&[&[u8]]] = &[&[FIDEICOMISO_SEED, mint_key.as_ref(), &[bump]]];
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let fideicomiso_info = ctx.accounts.fideicomiso.to_account_info();

    token_metadata_initialize(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TokenMetadataInitialize {
                program_id: token_program_info.clone(),
                metadata: mint_info.clone(),
                update_authority: fideicomiso_info.clone(),
                mint_authority: fideicomiso_info.clone(),
                mint: mint_info.clone(),
            },
            signer_seeds,
        ),
        args.name,
        args.symbol,
        args.uri,
    )?;

    for (key, value) in additional_metadata {
        token_metadata_update_field(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TokenMetadataUpdateField {
                    program_id: token_program_info.clone(),
                    metadata: mint_info.clone(),
                    update_authority: fideicomiso_info.clone(),
                },
                signer_seeds,
            ),
            Field::Key(key),
            value,
        )?;
    }

    emit!(FideicomisoCreado {
        fideicomiso: fideicomiso_key,
        mint: mint_key,
        asset_type: args.asset_type,
        max_supply: args.max_supply,
        price_per_token: args.price_per_token,
    });
    Ok(())
}

fn validate_text(value: &str, max_len: usize) -> Result<()> {
    require!(
        !value.is_empty() && value.len() <= max_len,
        FideTokError::TextoInvalido
    );
    Ok(())
}
