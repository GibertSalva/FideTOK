use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::spl_token_2022;

use crate::{
    constants::*,
    error::FideTokError,
    state::{Config, WhitelistEntry},
};

/// Lee la whitelist de una wallet. La direccion ya viene validada por `seeds` en el contexto;
/// aca se valida owner, discriminator y estado para devolver errores claros.
pub fn load_whitelist(info: &AccountInfo) -> Result<WhitelistEntry> {
    require!(
        info.owner == &crate::ID && !info.data_is_empty(),
        FideTokError::SinKyc
    );
    let data = info.try_borrow_data()?;
    let entry = WhitelistEntry::try_deserialize(&mut &data[..])?;
    require!(!entry.revoked, FideTokError::KycRevocado);
    Ok(entry)
}

/// Precio leido de una cuenta `PriceUpdateV2` de Pyth.
struct PythPrice {
    feed_id: [u8; 32],
    price: i64,
    conf: u64,
    exponent: i32,
    publish_time: i64,
}

/// Lee una cuenta `PriceUpdateV2` sin depender del SDK de Pyth (achica el binario).
/// Layout Borsh: discriminator(8) + write_authority(32) + verification_level(1 si es Full)
/// + PriceFeedMessage { feed_id(32), price(i64), conf(u64), exponent(i32), publish_time(i64), .. }.
fn parse_price_update(data: &[u8]) -> Result<PythPrice> {
    const VERIFICATION_OFFSET: usize = 8 + 32;
    const VERIFICATION_FULL: u8 = 1;
    const MESSAGE_OFFSET: usize = VERIFICATION_OFFSET + 1;

    fn read<const N: usize>(data: &[u8], at: usize) -> Result<[u8; N]> {
        data.get(at..at + N)
            .and_then(|bytes| bytes.try_into().ok())
            .ok_or_else(|| error!(FideTokError::OraculoInvalido))
    }

    require!(
        read::<8>(data, 0)? == PRICE_UPDATE_V2_DISCRIMINATOR,
        FideTokError::OraculoInvalido
    );
    // Solo precios con la verificacion completa de los guardianes de Wormhole.
    require!(
        data.get(VERIFICATION_OFFSET) == Some(&VERIFICATION_FULL),
        FideTokError::OraculoInvalido
    );
    Ok(PythPrice {
        feed_id: read::<32>(data, MESSAGE_OFFSET)?,
        price: i64::from_le_bytes(read::<8>(data, MESSAGE_OFFSET + 32)?),
        conf: u64::from_le_bytes(read::<8>(data, MESSAGE_OFFSET + 40)?),
        exponent: i32::from_le_bytes(read::<4>(data, MESSAGE_OFFSET + 48)?),
        publish_time: i64::from_le_bytes(read::<8>(data, MESSAGE_OFFSET + 52)?),
    })
}

/// Verifica con Pyth que USDC mantenga la paridad con el dolar.
/// Valida owner (receiver de Pyth), discriminator, feed id, verificacion completa,
/// antiguedad, desvio y confianza del precio.
pub fn check_usdc_peg(price_update_info: &AccountInfo, config: &Config) -> Result<()> {
    require_keys_eq!(
        *price_update_info.owner,
        PYTH_RECEIVER_PROGRAM_ID,
        FideTokError::OraculoInvalido
    );
    let data = price_update_info.try_borrow_data()?;
    let msg = parse_price_update(&data)?;
    require!(msg.feed_id == USDC_USD_FEED_ID, FideTokError::OraculoInvalido);

    let now = Clock::get()?.unix_timestamp;
    let max_age =
        i64::try_from(config.max_oracle_age_secs).map_err(|_| FideTokError::Overflow)?;
    let fresh_until = msg
        .publish_time
        .checked_add(max_age)
        .ok_or(FideTokError::Overflow)?;
    require!(fresh_until >= now, FideTokError::OraculoDesactualizado);

    require!(
        msg.price > 0 && msg.exponent <= 0 && msg.exponent >= -18,
        FideTokError::OraculoInvalido
    );
    let price = u128::try_from(msg.price).map_err(|_| FideTokError::OraculoInvalido)?;
    let one = 10u128
        .checked_pow(msg.exponent.unsigned_abs())
        .ok_or(FideTokError::Overflow)?;
    let bps = u128::from(BPS_DENOMINATOR);

    let depeg_bps = price
        .abs_diff(one)
        .checked_mul(bps)
        .ok_or(FideTokError::Overflow)?
        .checked_div(one)
        .ok_or(FideTokError::Overflow)?;
    require!(
        depeg_bps <= u128::from(config.max_depeg_bps),
        FideTokError::UsdcDespegado
    );

    let conf_bps = u128::from(msg.conf)
        .checked_mul(bps)
        .ok_or(FideTokError::Overflow)?
        .checked_div(price)
        .ok_or(FideTokError::Overflow)?;
    require!(
        conf_bps <= u128::from(MAX_ORACLE_CONF_BPS),
        FideTokError::OraculoPocoConfiable
    );
    Ok(())
}

/// USDC que recibe quien vende `cp_amount` certificados al pool: NAV menos spread, redondeo a favor del pool.
pub fn quote_sell(cp_amount: u64, nav_per_token: u64, spread_bps: u16) -> Result<u64> {
    let gross = u128::from(cp_amount)
        .checked_mul(u128::from(nav_per_token))
        .ok_or(FideTokError::Overflow)?;
    let net = gross
        .checked_mul(u128::from(BPS_DENOMINATOR - u64::from(spread_bps)))
        .ok_or(FideTokError::Overflow)?
        / u128::from(BPS_DENOMINATOR);
    Ok(u64::try_from(net).map_err(|_| FideTokError::Overflow)?)
}

/// USDC que paga quien compra `cp_amount` certificados al pool: NAV mas spread, redondeo a favor del pool.
pub fn quote_buy(cp_amount: u64, nav_per_token: u64, spread_bps: u16) -> Result<u64> {
    let gross = u128::from(cp_amount)
        .checked_mul(u128::from(nav_per_token))
        .ok_or(FideTokError::Overflow)?;
    let numerator = gross
        .checked_mul(u128::from(BPS_DENOMINATOR + u64::from(spread_bps)))
        .ok_or(FideTokError::Overflow)?;
    let denominator = u128::from(BPS_DENOMINATOR);
    let cost = numerator
        .checked_add(denominator - 1)
        .ok_or(FideTokError::Overflow)?
        / denominator;
    Ok(u64::try_from(cost).map_err(|_| FideTokError::Overflow)?)
}

/// Transfiere certificados (Token-2022 con transfer hook) resolviendo las cuentas extra del hook.
/// `hook_accounts` debe incluir: programa hook, lista de cuentas extra, programa fidetok,
/// whitelist de origen y destino, y el fideicomiso.
#[allow(clippy::too_many_arguments)]
pub fn transfer_cp_with_hook<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    hook_accounts: &[AccountInfo<'info>],
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut ix = spl_token_2022::instruction::transfer_checked(
        token_program.key,
        from.key,
        mint.key,
        to.key,
        authority.key,
        &[],
        amount,
        CP_DECIMALS,
    )?;
    let mut infos = vec![from.clone(), mint.clone(), to.clone(), authority.clone()];
    spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi(
        &mut ix,
        &mut infos,
        &HOOK_PROGRAM_ID,
        from.clone(),
        mint.clone(),
        to.clone(),
        authority.clone(),
        amount,
        hook_accounts,
    )?;
    infos.push(token_program.clone());
    invoke_signed(&ix, &infos, signer_seeds)?;
    Ok(())
}

pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[usize::from(byte >> 4)] as char);
        out.push(HEX[usize::from(byte & 0x0f)] as char);
    }
    out
}
