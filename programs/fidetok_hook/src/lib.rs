use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};
use fidetok::state::{Fideicomiso, Residency, WhitelistEntry};
use spl_discriminator::SplDiscriminate;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_token_2022_interface::{
    extension::{
        transfer_hook::{TransferHook, TransferHookAccount},
        BaseStateWithExtensions, StateWithExtensions,
    },
    state::{Account as SplTokenAccount, Mint as SplMint},
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("Dtu3n9sQwYX9ibEU81q5hbP2VRN5XoWpuMLi2NuUCfqm");

/// Cuentas extra que Token-2022 le pasa al hook: programa fidetok, whitelist de origen,
/// whitelist de destino y fideicomiso.
const EXTRA_METAS_COUNT: usize = 4;

#[program]
pub mod fidetok_hook {
    use super::*;

    /// Registra las cuentas extra del hook para un mint. El contenido es fijo,
    /// asi que cualquiera puede inicializarlo sin riesgo.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        {
            let mint_info = ctx.accounts.mint.to_account_info();
            let data = mint_info.try_borrow_data()?;
            let mint = StateWithExtensions::<SplMint>::unpack(&data)?;
            let hook = mint.get_extension::<TransferHook>()?;
            require!(
                Option::<Pubkey>::from(hook.program_id) == Some(crate::ID),
                HookError::MintInvalido
            );
        }

        let metas = extra_account_metas()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(
            &mut ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?,
            &metas,
        )?;
        Ok(())
    }

    /// Se ejecuta en cada transferencia de certificados. Es el cerrojo de la oferta privada (CNV):
    /// origen y destino tienen que tener KYC aprobado en FideTOK.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
        let accounts = &ctx.accounts;
        let mint_key = accounts.mint.key();

        let (expected_list, _) = Pubkey::find_program_address(
            &[fidetok::EXTRA_ACCOUNT_METAS_SEED, mint_key.as_ref()],
            &crate::ID,
        );
        require_keys_eq!(
            accounts.extra_account_meta_list.key(),
            expected_list,
            HookError::CuentaInvalida
        );
        let (expected_source, _) = Pubkey::find_program_address(
            &[fidetok::WHITELIST_SEED, accounts.source_token.owner.as_ref()],
            &fidetok::ID,
        );
        require_keys_eq!(
            accounts.source_whitelist.key(),
            expected_source,
            HookError::CuentaInvalida
        );
        let (expected_destination, _) = Pubkey::find_program_address(
            &[fidetok::WHITELIST_SEED, accounts.destination_token.owner.as_ref()],
            &fidetok::ID,
        );
        require_keys_eq!(
            accounts.destination_whitelist.key(),
            expected_destination,
            HookError::CuentaInvalida
        );
        let (expected_fideicomiso, _) = Pubkey::find_program_address(
            &[fidetok::FIDEICOMISO_SEED, mint_key.as_ref()],
            &fidetok::ID,
        );
        require_keys_eq!(
            accounts.fideicomiso.key(),
            expected_fideicomiso,
            HookError::CuentaInvalida
        );

        assert_is_transferring(&accounts.source_token.to_account_info())?;

        let fideicomiso = load_fideicomiso(&accounts.fideicomiso.to_account_info())?;
        require!(
            !fideicomiso.transfers_locked,
            HookError::TransferenciasBloqueadas
        );

        load_whitelist(&accounts.source_whitelist.to_account_info())
            .ok_or(HookError::EmisorSinKyc)?;
        let destination = load_whitelist(&accounts.destination_whitelist.to_account_info())
            .ok_or(HookError::ReceptorSinKyc)?;
        if fideicomiso.restrict_foreign {
            require!(
                destination.residency != Residency::Extranjero,
                HookError::ExtranjeroNoPermitido
            );
        }
        Ok(())
    }
}

fn extra_account_metas() -> Result<Vec<ExtraAccountMeta>> {
    // Indices: 0 origen, 1 mint, 2 destino, 3 owner, 4 esta lista, 5+ cuentas extra.
    const FIDETOK_PROGRAM_INDEX: u8 = 5;
    Ok(vec![
        ExtraAccountMeta::new_with_pubkey(&fidetok::ID, false, false)?,
        // whitelist del duenio de la cuenta origen (owner = bytes 32..64 de la token account)
        ExtraAccountMeta::new_external_pda_with_seeds(
            FIDETOK_PROGRAM_INDEX,
            &[
                Seed::Literal {
                    bytes: fidetok::WHITELIST_SEED.to_vec(),
                },
                Seed::AccountData {
                    account_index: 0,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )?,
        // whitelist del duenio de la cuenta destino
        ExtraAccountMeta::new_external_pda_with_seeds(
            FIDETOK_PROGRAM_INDEX,
            &[
                Seed::Literal {
                    bytes: fidetok::WHITELIST_SEED.to_vec(),
                },
                Seed::AccountData {
                    account_index: 2,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )?,
        // fideicomiso del mint
        ExtraAccountMeta::new_external_pda_with_seeds(
            FIDETOK_PROGRAM_INDEX,
            &[
                Seed::Literal {
                    bytes: fidetok::FIDEICOMISO_SEED.to_vec(),
                },
                Seed::AccountKey { index: 1 },
            ],
            false,
            false,
        )?,
    ])
}

/// Solo se acepta la ejecucion durante una transferencia real de Token-2022.
fn assert_is_transferring(source_info: &AccountInfo) -> Result<()> {
    let data = source_info.try_borrow_data()?;
    let account = StateWithExtensions::<SplTokenAccount>::unpack(&data)?;
    let extension = account.get_extension::<TransferHookAccount>()?;
    require!(
        bool::from(extension.transferring),
        HookError::NoEstaTransfiriendo
    );
    Ok(())
}

fn load_fideicomiso(info: &AccountInfo) -> Result<Fideicomiso> {
    require!(
        info.owner == &fidetok::ID && !info.data_is_empty(),
        HookError::FideicomisoInvalido
    );
    let data = info.try_borrow_data()?;
    Fideicomiso::try_deserialize(&mut &data[..]).map_err(|_| error!(HookError::FideicomisoInvalido))
}

/// Devuelve la whitelist si existe, es de fidetok y no esta revocada.
fn load_whitelist(info: &AccountInfo) -> Option<WhitelistEntry> {
    if info.owner != &fidetok::ID || info.data_is_empty() {
        return None;
    }
    let data = info.try_borrow_data().ok()?;
    let entry = WhitelistEntry::try_deserialize(&mut &data[..]).ok()?;
    (!entry.revoked).then_some(entry)
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: cuenta TLV del interface de transfer hook; se inicializa en el handler.
    #[account(
        init,
        payer = payer,
        space = ExtraAccountMetaList::size_of(EXTRA_METAS_COUNT)?,
        seeds = [fidetok::EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

/// El orden de las cuentas lo fija el interface de transfer hook + la lista de cuentas extra.
#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(token::mint = mint)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: owner o delegado de la cuenta origen; Token-2022 ya valido su firma.
    pub owner: UncheckedAccount<'info>,
    /// CHECK: lista de cuentas extra; la direccion se valida en el handler.
    pub extra_account_meta_list: UncheckedAccount<'info>,
    /// CHECK: programa fidetok; se valida por direccion.
    #[account(address = fidetok::ID)]
    pub fidetok_program: UncheckedAccount<'info>,
    /// CHECK: whitelist del duenio de la cuenta origen; puede no existir (se valida en el handler).
    pub source_whitelist: UncheckedAccount<'info>,
    /// CHECK: whitelist del duenio de la cuenta destino; puede no existir (se valida en el handler).
    pub destination_whitelist: UncheckedAccount<'info>,
    /// CHECK: fideicomiso del mint; se valida en el handler.
    pub fideicomiso: UncheckedAccount<'info>,
}

#[error_code]
pub enum HookError {
    #[msg("El hook solo se ejecuta durante una transferencia de Token-2022")]
    NoEstaTransfiriendo,
    #[msg("El emisor no tiene KYC aprobado en FideTOK")]
    EmisorSinKyc,
    #[msg("El receptor no tiene KYC aprobado en FideTOK: la oferta es privada (CNV)")]
    ReceptorSinKyc,
    #[msg("Activo rural: la Ley 26.737 no permite transferir a extranjeros")]
    ExtranjeroNoPermitido,
    #[msg("Hay una distribucion de renta en curso: transferencias bloqueadas")]
    TransferenciasBloqueadas,
    #[msg("Fideicomiso invalido")]
    FideicomisoInvalido,
    #[msg("El mint no usa este transfer hook")]
    MintInvalido,
    #[msg("Cuenta extra invalida")]
    CuentaInvalida,
}
