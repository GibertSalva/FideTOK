use anchor_lang::prelude::*;

#[error_code]
pub enum FideTokError {
    #[msg("Solo el fiduciario (admin) puede ejecutar esta accion")]
    NoAutorizado,
    #[msg("La wallet no tiene KYC aprobado")]
    SinKyc,
    #[msg("El KYC de esta wallet fue revocado")]
    KycRevocado,
    #[msg("Activo rural: la Ley 26.737 no permite inversores extranjeros")]
    ExtranjeroNoPermitido,
    #[msg("Supera el tope de certificados del fideicomiso")]
    SupplyExcedido,
    #[msg("El precio supera el limite indicado")]
    LimiteDePrecio,
    #[msg("Monto invalido")]
    MontoInvalido,
    #[msg("Parametro invalido")]
    ParametroInvalido,
    #[msg("Overflow aritmetico")]
    Overflow,
    #[msg("Hay una distribucion en curso: transferencias y suscripciones bloqueadas")]
    TransferenciasBloqueadas,
    #[msg("La distribucion ya esta cerrada")]
    DistribucionCerrada,
    #[msg("Liquidez insuficiente en el pool")]
    LiquidezInsuficiente,
    #[msg("Precio del oraculo desactualizado")]
    OraculoDesactualizado,
    #[msg("USDC perdio la paridad con el dolar: operaciones pausadas")]
    UsdcDespegado,
    #[msg("Intervalo de confianza del oraculo demasiado amplio")]
    OraculoPocoConfiable,
    #[msg("Cuenta de oraculo invalida")]
    OraculoInvalido,
    #[msg("Variacion de NAV fuera de rango")]
    NavFueraDeRango,
    #[msg("Spread invalido")]
    SpreadInvalido,
    #[msg("Texto demasiado largo o vacio")]
    TextoInvalido,
    #[msg("Tipo de cambio invalido")]
    TipoDeCambioInvalido,
    #[msg("El tenedor no tiene certificados")]
    SinTenencia,
}
