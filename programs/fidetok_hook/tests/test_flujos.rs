//! Tests E2E de los 5 flujos de FideTOK sobre LiteSVM (Token-2022 + transfer hook + Pyth).
//! Requiere `anchor build` previo: carga `target/deploy/fidetok.so` y `fidetok_hook.so`.

use {
    anchor_lang::{
        prelude::{pubkey, Clock, Pubkey},
        solana_program::{
            bpf_loader_upgradeable,
            instruction::{AccountMeta, Instruction},
            system_instruction, system_program,
        },
        AccountDeserialize, AccountSerialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{get_associated_token_address_with_program_id, spl_associated_token_account},
        token::spl_token,
    },
    fidetok::{
        state::{AssetType, Distribution, Fideicomiso, FxSource, Residency, SwapSide},
        CreateFideicomisoArgs,
    },
    litesvm::LiteSVM,
    pyth_solana_receiver_sdk::price_update::{PriceFeedMessage, PriceUpdateV2, VerificationLevel},
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    spl_token_2022_interface::{
        extension::{BaseStateWithExtensions, StateWithExtensions},
        state::{Account as TokenAccountState, Mint as MintState},
    },
    spl_token_metadata_interface::state::TokenMetadata,
};

const NOW: i64 = 1_789_200_000;
const USDC: u64 = 1_000_000;
const PRICE_PER_CP: u64 = 100 * USDC;
const COMPUTE_BUDGET_ID: Pubkey = pubkey!("ComputeBudget111111111111111111111111111111");
const TOKEN_2022: Pubkey = spl_token_2022_interface::ID;
const TOKEN: Pubkey = spl_token::ID;
const ATA_PROGRAM: Pubkey = spl_associated_token_account::program::ID;

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    usdc_mint: Pubkey,
    price_update: Pubkey,
}

// ---------- utilidades ----------

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &fidetok::ID).0
}
fn config_pda() -> Pubkey {
    pda(&[fidetok::CONFIG_SEED])
}
fn fideicomiso_pda(mint: &Pubkey) -> Pubkey {
    pda(&[fidetok::FIDEICOMISO_SEED, mint.as_ref()])
}
fn whitelist_pda(wallet: &Pubkey) -> Pubkey {
    pda(&[fidetok::WHITELIST_SEED, wallet.as_ref()])
}
fn pool_pda(mint: &Pubkey) -> Pubkey {
    pda(&[fidetok::POOL_SEED, mint.as_ref()])
}
fn distribution_pda(fideicomiso: &Pubkey, index: u32) -> Pubkey {
    pda(&[
        fidetok::DISTRIBUTION_SEED,
        fideicomiso.as_ref(),
        &index.to_le_bytes(),
    ])
}
fn payout_pda(distribution: &Pubkey, holder: &Pubkey) -> Pubkey {
    pda(&[fidetok::PAYOUT_SEED, distribution.as_ref(), holder.as_ref()])
}
fn extra_metas_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[fidetok::EXTRA_ACCOUNT_METAS_SEED, mint.as_ref()],
        &fidetok_hook::ID,
    )
    .0
}
fn ata(owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, token_program)
}

fn ix(program_id: Pubkey, accounts: impl ToAccountMetas, data: impl InstructionData) -> Instruction {
    Instruction::new_with_bytes(program_id, &data.data(), accounts.to_account_metas(None))
}

fn cu_limit(units: u32) -> Instruction {
    let mut data = vec![2u8];
    data.extend_from_slice(&units.to_le_bytes());
    Instruction::new_with_bytes(COMPUTE_BUDGET_ID, &data, vec![])
}

/// Envia una transaccion. Devuelve los logs como error para poder chequear el codigo de error.
fn send(svm: &mut LiteSVM, ixs: &[Instruction], payer: &Keypair, signers: &[&Keypair]) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let mut all: Vec<&Keypair> = vec![payer];
    all.extend_from_slice(signers);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), all.as_slice())
        .map_err(|e| e.to_string())?;
    let result = svm.send_transaction(tx);
    svm.expire_blockhash();
    result
        .map(|_| ())
        .map_err(|failed| format!("{:?}\n{}", failed.err, failed.meta.logs.join("\n")))
}

fn expect_err(result: Result<(), String>, code: &str) {
    match result {
        Ok(()) => panic!("se esperaba el error {code} y la transaccion paso"),
        Err(logs) => assert!(logs.contains(code), "se esperaba {code}, logs:\n{logs}"),
    }
}

fn token_balance(svm: &LiteSVM, address: &Pubkey) -> u64 {
    let account = svm.get_account(address).expect("token account inexistente");
    StateWithExtensions::<TokenAccountState>::unpack(&account.data)
        .unwrap()
        .base
        .amount
}

fn load<T: AccountDeserialize>(svm: &LiteSVM, address: &Pubkey) -> T {
    let account = svm.get_account(address).expect("cuenta inexistente");
    T::try_deserialize(&mut account.data.as_slice()).unwrap()
}

fn set_usdc_price(svm: &mut LiteSVM, address: Pubkey, price: i64, publish_time: i64) {
    let update = PriceUpdateV2 {
        write_authority: Pubkey::new_unique(),
        verification_level: VerificationLevel::Full,
        price_message: PriceFeedMessage {
            feed_id: fidetok::USDC_USD_FEED_ID,
            price,
            conf: 5_000,
            exponent: -8,
            publish_time,
            prev_publish_time: publish_time - 1,
            ema_price: price,
            ema_conf: 5_000,
        },
        posted_slot: 1,
    };
    let mut data = Vec::new();
    update.try_serialize(&mut data).unwrap();
    svm.set_account(
        address,
        Account {
            lamports: 10_000_000,
            data,
            owner: pyth_solana_receiver_sdk::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn create_usdc_mint(svm: &mut LiteSVM, payer: &Keypair) -> Pubkey {
    let mint = Keypair::new();
    let space = 82u64;
    let lamports = svm.minimum_balance_for_rent_exemption(space as usize);
    let ixs = [
        system_instruction::create_account(&payer.pubkey(), &mint.pubkey(), lamports, space, &TOKEN),
        spl_token::instruction::initialize_mint2(&TOKEN, &mint.pubkey(), &payer.pubkey(), None, 6).unwrap(),
    ];
    send(svm, &ixs, payer, &[&mint]).unwrap();
    mint.pubkey()
}

fn create_ata(svm: &mut LiteSVM, payer: &Keypair, owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    let create = spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        &payer.pubkey(),
        owner,
        mint,
        token_program,
    );
    send(svm, &[create], payer, &[]).unwrap();
    ata(owner, mint, token_program)
}

fn fund_usdc(env: &mut Env, owner: &Pubkey, amount: u64) -> Pubkey {
    let admin = env.admin.insecure_clone();
    let account = create_ata(&mut env.svm, &admin, owner, &env.usdc_mint, &TOKEN);
    let mint_ix = spl_token::instruction::mint_to(&TOKEN, &env.usdc_mint, &account, &admin.pubkey(), &[], amount).unwrap();
    send(&mut env.svm, &[mint_ix], &admin, &[]).unwrap();
    account
}

fn new_wallet(env: &mut Env) -> Keypair {
    let wallet = Keypair::new();
    env.svm.airdrop(&wallet.pubkey(), 10_000_000_000).unwrap();
    wallet
}

// ---------- setup + instrucciones ----------

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let deploy = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy");
    svm.add_program_from_file(fidetok::ID, format!("{deploy}/fidetok.so")).unwrap();
    svm.add_program_from_file(fidetok_hook::ID, format!("{deploy}/fidetok_hook.so")).unwrap();

    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = NOW;
    svm.set_sysvar(&clock);

    // LiteSVM despliega con el loader upgradeable sin authority: la seteamos para testear init_config.
    let upgrade_authority = Keypair::new();
    let program_data = Pubkey::find_program_address(&[fidetok::ID.as_ref()], &bpf_loader_upgradeable::ID).0;
    let mut program_data_account = svm.get_account(&program_data).expect("sin ProgramData");
    program_data_account.data[12] = 1;
    program_data_account.data[13..45].copy_from_slice(upgrade_authority.pubkey().as_ref());
    svm.set_account(program_data, program_data_account).unwrap();

    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();
    svm.airdrop(&upgrade_authority.pubkey(), 10_000_000_000).unwrap();
    let usdc_mint = create_usdc_mint(&mut svm, &admin);
    let price_update = Pubkey::new_unique();
    set_usdc_price(&mut svm, price_update, 99_990_000, NOW - 60);

    let init_accounts = |authority: Pubkey| fidetok::accounts::InitConfig {
        authority,
        config: config_pda(),
        usdc_mint,
        usdc_token_program: TOKEN,
        program: fidetok::ID,
        program_data,
        system_program: system_program::ID,
    };
    let init_data = fidetok::instruction::InitConfig {
        admin: admin.pubkey(),
        max_oracle_age_secs: 900,
        max_depeg_bps: 200,
    };

    // Solo la upgrade authority puede inicializar la configuracion global.
    let intruder = Keypair::new();
    svm.airdrop(&intruder.pubkey(), 1_000_000_000).unwrap();
    expect_err(
        send(&mut svm, &[ix(fidetok::ID, init_accounts(intruder.pubkey()), init_data.clone())], &intruder, &[]),
        "NoAutorizado",
    );
    send(
        &mut svm,
        &[ix(fidetok::ID, init_accounts(upgrade_authority.pubkey()), init_data)],
        &upgrade_authority,
        &[],
    )
    .unwrap();

    Env { svm, admin, usdc_mint, price_update }
}

fn create_fideicomiso(env: &mut Env, asset_type: AssetType, max_supply: u64) -> Pubkey {
    let mint = Keypair::new();
    let fideicomiso = fideicomiso_pda(&mint.pubkey());
    let admin = env.admin.insecure_clone();
    let args = CreateFideicomisoArgs {
        name: "Fideicomiso Demo".to_string(),
        symbol: "FDEMO".to_string(),
        uri: "https://fidetok.app/api/metadata/demo".to_string(),
        asset_type,
        cuit_fideicomiso: "30-71234567-8".to_string(),
        registro: "Matricula 12345 - RPI Cordoba".to_string(),
        contrato_uri: "https://fidetok.app/contratos/demo".to_string(),
        contract_sha256: [7u8; 32],
        valuation_usd: 1_000_000,
        price_per_token: PRICE_PER_CP,
        max_supply,
    };
    let create = ix(
        fidetok::ID,
        fidetok::accounts::CreateFideicomiso {
            admin: admin.pubkey(),
            config: config_pda(),
            originador: Pubkey::new_unique(),
            fideicomiso,
            mint: mint.pubkey(),
            usdc_mint: env.usdc_mint,
            usdc_vault: ata(&fideicomiso, &env.usdc_mint, &TOKEN),
            token_program: TOKEN_2022,
            usdc_token_program: TOKEN,
            associated_token_program: ATA_PROGRAM,
            system_program: system_program::ID,
        },
        fidetok::instruction::CreateFideicomiso { args },
    );
    let init_hook = ix(
        fidetok_hook::ID,
        fidetok_hook::accounts::InitializeExtraAccountMetaList {
            payer: admin.pubkey(),
            extra_account_meta_list: extra_metas_pda(&mint.pubkey()),
            mint: mint.pubkey(),
            system_program: system_program::ID,
        },
        fidetok_hook::instruction::InitializeExtraAccountMetaList {},
    );
    send(&mut env.svm, &[cu_limit(1_000_000), create, init_hook], &admin, &[&mint]).unwrap();
    mint.pubkey()
}

fn whitelist(env: &mut Env, wallet: &Pubkey, residency: Residency) {
    let admin = env.admin.insecure_clone();
    let add = ix(
        fidetok::ID,
        fidetok::accounts::AddToWhitelist {
            admin: admin.pubkey(),
            config: config_pda(),
            whitelist_entry: whitelist_pda(wallet),
            system_program: system_program::ID,
        },
        fidetok::instruction::AddToWhitelist {
            wallet: *wallet,
            kyc_commitment: [1u8; 32],
            residency,
        },
    );
    send(&mut env.svm, &[add], &admin, &[]).unwrap();
}

fn buy(env: &mut Env, investor: &Keypair, mint: &Pubkey, cp_amount: u64) -> Result<(), String> {
    let fideicomiso = fideicomiso_pda(mint);
    let buy = ix(
        fidetok::ID,
        fidetok::accounts::BuyPrimary {
            investor: investor.pubkey(),
            config: config_pda(),
            fideicomiso,
            investor_whitelist: whitelist_pda(&investor.pubkey()),
            mint: *mint,
            investor_cp_account: ata(&investor.pubkey(), mint, &TOKEN_2022),
            usdc_mint: env.usdc_mint,
            investor_usdc_account: ata(&investor.pubkey(), &env.usdc_mint, &TOKEN),
            usdc_vault: ata(&fideicomiso, &env.usdc_mint, &TOKEN),
            price_update: env.price_update,
            token_program: TOKEN_2022,
            usdc_token_program: TOKEN,
            associated_token_program: ATA_PROGRAM,
            system_program: system_program::ID,
        },
        fidetok::instruction::BuyPrimary {
            cp_amount,
            max_usdc: cp_amount * PRICE_PER_CP,
        },
    );
    send(&mut env.svm, &[buy], investor, &[])
}

/// Transferencia directa de certificados (P2P) con las cuentas extra que exige el hook.
fn transfer_cp(env: &mut Env, from: &Keypair, to: &Pubkey, mint: &Pubkey, amount: u64) -> Result<(), String> {
    let payer = env.admin.insecure_clone();
    let destination = create_ata(&mut env.svm, &payer, to, mint, &TOKEN_2022);
    let mut transfer = spl_token_2022_interface::instruction::transfer_checked(
        &TOKEN_2022,
        &ata(&from.pubkey(), mint, &TOKEN_2022),
        mint,
        &destination,
        &from.pubkey(),
        &[],
        amount,
        0,
    )
    .unwrap();
    transfer.accounts.extend([
        AccountMeta::new_readonly(fidetok::ID, false),
        AccountMeta::new_readonly(whitelist_pda(&from.pubkey()), false),
        AccountMeta::new_readonly(whitelist_pda(to), false),
        AccountMeta::new_readonly(fideicomiso_pda(mint), false),
        AccountMeta::new_readonly(fidetok_hook::ID, false),
        AccountMeta::new_readonly(extra_metas_pda(mint), false),
    ]);
    send(&mut env.svm, &[transfer], from, &[])
}

fn create_pool(env: &mut Env, mint: &Pubkey, spread_bps: u16) {
    let admin = env.admin.insecure_clone();
    let pool = pool_pda(mint);
    let create = ix(
        fidetok::ID,
        fidetok::accounts::CreatePool {
            admin: admin.pubkey(),
            config: config_pda(),
            fideicomiso: fideicomiso_pda(mint),
            pool,
            pool_whitelist: whitelist_pda(&pool),
            mint: *mint,
            usdc_mint: env.usdc_mint,
            pool_cp_vault: ata(&pool, mint, &TOKEN_2022),
            pool_usdc_vault: ata(&pool, &env.usdc_mint, &TOKEN),
            token_program: TOKEN_2022,
            usdc_token_program: TOKEN,
            associated_token_program: ATA_PROGRAM,
            system_program: system_program::ID,
        },
        fidetok::instruction::CreatePool { spread_bps },
    );
    send(&mut env.svm, &[create], &admin, &[]).unwrap();
}

fn add_liquidity(env: &mut Env, mint: &Pubkey, cp_amount: u64, usdc_amount: u64) {
    let admin = env.admin.insecure_clone();
    let admin_usdc = fund_usdc(env, &admin.pubkey(), cp_amount * PRICE_PER_CP + usdc_amount);
    let pool = pool_pda(mint);
    let fideicomiso = fideicomiso_pda(mint);
    let add = ix(
        fidetok::ID,
        fidetok::accounts::AddLiquidity {
            admin: admin.pubkey(),
            config: config_pda(),
            fideicomiso,
            pool,
            mint: *mint,
            usdc_mint: env.usdc_mint,
            admin_usdc_account: admin_usdc,
            usdc_vault: ata(&fideicomiso, &env.usdc_mint, &TOKEN),
            pool_cp_vault: ata(&pool, mint, &TOKEN_2022),
            pool_usdc_vault: ata(&pool, &env.usdc_mint, &TOKEN),
            token_program: TOKEN_2022,
            usdc_token_program: TOKEN,
        },
        fidetok::instruction::AddLiquidity { cp_amount, usdc_amount },
    );
    send(&mut env.svm, &[add], &admin, &[]).unwrap();
}

fn swap(env: &mut Env, user: &Keypair, mint: &Pubkey, side: SwapSide, cp_amount: u64, limit_usdc: u64) -> Result<(), String> {
    let pool = pool_pda(mint);
    let swap = ix(
        fidetok::ID,
        fidetok::accounts::Swap {
            user: user.pubkey(),
            config: config_pda(),
            fideicomiso: fideicomiso_pda(mint),
            pool,
            mint: *mint,
            usdc_mint: env.usdc_mint,
            user_whitelist: whitelist_pda(&user.pubkey()),
            pool_whitelist: whitelist_pda(&pool),
            user_cp_account: ata(&user.pubkey(), mint, &TOKEN_2022),
            user_usdc_account: ata(&user.pubkey(), &env.usdc_mint, &TOKEN),
            pool_cp_vault: ata(&pool, mint, &TOKEN_2022),
            pool_usdc_vault: ata(&pool, &env.usdc_mint, &TOKEN),
            price_update: env.price_update,
            hook_program: fidetok_hook::ID,
            extra_account_metas: extra_metas_pda(mint),
            fidetok_program: fidetok::ID,
            token_program: TOKEN_2022,
            usdc_token_program: TOKEN,
            associated_token_program: ATA_PROGRAM,
            system_program: system_program::ID,
        },
        fidetok::instruction::Swap { side, cp_amount, limit_usdc },
    );
    send(&mut env.svm, &[cu_limit(400_000), swap], user, &[])
}

fn update_nav(env: &mut Env, mint: &Pubkey, nav_per_token: u64) -> Result<(), String> {
    let admin = env.admin.insecure_clone();
    let update = ix(
        fidetok::ID,
        fidetok::accounts::UpdateNav {
            admin: admin.pubkey(),
            config: config_pda(),
            fideicomiso: fideicomiso_pda(mint),
        },
        fidetok::instruction::UpdateNav { nav_per_token },
    );
    send(&mut env.svm, &[update], &admin, &[])
}

fn start_distribution(env: &mut Env, mint: &Pubkey, total_usdc: u64, ars_per_usd: u64) -> Pubkey {
    let admin = env.admin.insecure_clone();
    let admin_usdc = fund_usdc(env, &admin.pubkey(), total_usdc);
    let fideicomiso = fideicomiso_pda(mint);
    let index = load::<Fideicomiso>(&env.svm, &fideicomiso).distribution_count;
    let distribution = distribution_pda(&fideicomiso, index);
    let start = ix(
        fidetok::ID,
        fidetok::accounts::StartDistribution {
            admin: admin.pubkey(),
            config: config_pda(),
            fideicomiso,
            mint: *mint,
            distribution,
            usdc_mint: env.usdc_mint,
            admin_usdc_account: admin_usdc,
            distribution_vault: ata(&distribution, &env.usdc_mint, &TOKEN),
            token_program: TOKEN_2022,
            usdc_token_program: TOKEN,
            associated_token_program: ATA_PROGRAM,
            system_program: system_program::ID,
        },
        fidetok::instruction::StartDistribution {
            total_usdc,
            ars_per_usd,
            fx_source: FxSource::OficialBna,
            fx_timestamp: NOW,
        },
    );
    send(&mut env.svm, &[start], &admin, &[]).unwrap();
    distribution
}

fn pay_dividend(env: &mut Env, payer: &Keypair, mint: &Pubkey, distribution: &Pubkey, holder: &Pubkey) -> Result<(), String> {
    let pay = ix(
        fidetok::ID,
        fidetok::accounts::PayDividend {
            payer: payer.pubkey(),
            config: config_pda(),
            fideicomiso: fideicomiso_pda(mint),
            distribution: *distribution,
            mint: *mint,
            usdc_mint: env.usdc_mint,
            holder: *holder,
            holder_cp_account: ata(holder, mint, &TOKEN_2022),
            holder_usdc_account: ata(holder, &env.usdc_mint, &TOKEN),
            payout: payout_pda(distribution, holder),
            distribution_vault: ata(distribution, &env.usdc_mint, &TOKEN),
            token_program: TOKEN_2022,
            usdc_token_program: TOKEN,
            associated_token_program: ATA_PROGRAM,
            system_program: system_program::ID,
        },
        fidetok::instruction::PayDividend {},
    );
    send(&mut env.svm, &[pay], payer, &[])
}

fn close_distribution(env: &mut Env, mint: &Pubkey, distribution: &Pubkey) {
    let admin = env.admin.insecure_clone();
    let close = ix(
        fidetok::ID,
        fidetok::accounts::CloseDistribution {
            admin: admin.pubkey(),
            config: config_pda(),
            fideicomiso: fideicomiso_pda(mint),
            distribution: *distribution,
            usdc_mint: env.usdc_mint,
            distribution_vault: ata(distribution, &env.usdc_mint, &TOKEN),
            admin_usdc_account: ata(&admin.pubkey(), &env.usdc_mint, &TOKEN),
            usdc_token_program: TOKEN,
        },
        fidetok::instruction::CloseDistribution {},
    );
    send(&mut env.svm, &[close], &admin, &[]).unwrap();
}

/// Inversor con KYC y USDC para operar.
fn investor(env: &mut Env, residency: Residency, usdc: u64) -> Keypair {
    let wallet = new_wallet(env);
    whitelist(env, &wallet.pubkey(), residency);
    fund_usdc(env, &wallet.pubkey(), usdc);
    wallet
}

// ---------- tests ----------

#[test]
fn flujo1_emision_con_metadata_legal() {
    let mut env = setup();
    let mint = create_fideicomiso(&mut env, AssetType::Rural, 10_000);

    let fideicomiso: Fideicomiso = load(&env.svm, &fideicomiso_pda(&mint));
    assert_eq!(fideicomiso.mint, mint);
    assert!(fideicomiso.restrict_foreign, "un activo rural activa la Ley de Tierras");
    assert_eq!(fideicomiso.nav_per_token, PRICE_PER_CP);
    assert_eq!(fideicomiso.contract_sha256, [7u8; 32]);

    let mint_account = env.svm.get_account(&mint).unwrap();
    let state = StateWithExtensions::<MintState>::unpack(&mint_account.data).unwrap();
    assert_eq!(state.base.decimals, 0);
    let metadata = state.get_variable_len_extension::<TokenMetadata>().unwrap();
    let field = |key: &str| {
        metadata
            .additional_metadata
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
    };
    assert_eq!(field("cuit_fideicomiso").as_deref(), Some("30-71234567-8"));
    assert_eq!(field("tipo_activo").as_deref(), Some("rural"));
    assert_eq!(field("ley_tierras").as_deref(), Some("aplica"));
    assert_eq!(field("contrato_sha256"), Some("07".repeat(32)));

    let inmueble = create_fideicomiso(&mut env, AssetType::Inmueble, 10_000);
    let fideicomiso: Fideicomiso = load(&env.svm, &fideicomiso_pda(&inmueble));
    assert!(!fideicomiso.restrict_foreign);
}

#[test]
fn flujos2y3_kyc_y_suscripcion_primaria() {
    let mut env = setup();
    let campo = create_fideicomiso(&mut env, AssetType::Rural, 100);
    let edificio = create_fideicomiso(&mut env, AssetType::Inmueble, 100);

    // Sin KYC no hay suscripcion.
    let sin_kyc = new_wallet(&mut env);
    fund_usdc(&mut env, &sin_kyc.pubkey(), 1_000 * USDC);
    expect_err(buy(&mut env, &sin_kyc, &edificio, 1), "SinKyc");

    // Con KYC compra y paga al precio de emision.
    let ar = investor(&mut env, Residency::Argentina, 10_000 * USDC);
    buy(&mut env, &ar, &campo, 50).unwrap();
    assert_eq!(token_balance(&env.svm, &ata(&ar.pubkey(), &campo, &TOKEN_2022)), 50);
    let vault = ata(&fideicomiso_pda(&campo), &env.usdc_mint, &TOKEN);
    assert_eq!(token_balance(&env.svm, &vault), 50 * PRICE_PER_CP);

    // Ley de Tierras: el extranjero no puede entrar al campo, si al edificio.
    let extranjero = investor(&mut env, Residency::Extranjero, 10_000 * USDC);
    expect_err(buy(&mut env, &extranjero, &campo, 1), "ExtranjeroNoPermitido");
    buy(&mut env, &extranjero, &edificio, 10).unwrap();

    // Tope de certificados.
    expect_err(buy(&mut env, &ar, &campo, 51), "SupplyExcedido");

    // KYC revocado.
    let admin = env.admin.insecure_clone();
    let revoke = ix(
        fidetok::ID,
        fidetok::accounts::RevokeWhitelist {
            admin: admin.pubkey(),
            config: config_pda(),
            whitelist_entry: whitelist_pda(&ar.pubkey()),
        },
        fidetok::instruction::RevokeWhitelist { wallet: ar.pubkey() },
    );
    send(&mut env.svm, &[revoke], &admin, &[]).unwrap();
    expect_err(buy(&mut env, &ar, &edificio, 1), "KycRevocado");
}

#[test]
fn cerrojo_cnv_transfer_hook() {
    let mut env = setup();
    let campo = create_fideicomiso(&mut env, AssetType::Rural, 1_000);
    let a = investor(&mut env, Residency::Argentina, 10_000 * USDC);
    let b = investor(&mut env, Residency::Argentina, 0);
    buy(&mut env, &a, &campo, 20).unwrap();

    // Entre wallets con KYC: pasa.
    transfer_cp(&mut env, &a, &b.pubkey(), &campo, 5).unwrap();
    assert_eq!(token_balance(&env.svm, &ata(&b.pubkey(), &campo, &TOKEN_2022)), 5);

    // A una wallet sin KYC (p. ej. un exchange): la red la rechaza.
    let exchange = Pubkey::new_unique();
    expect_err(transfer_cp(&mut env, &a, &exchange, &campo, 1), "ReceptorSinKyc");

    // A un extranjero en un activo rural: rechazada.
    let extranjero = investor(&mut env, Residency::Extranjero, 0);
    expect_err(
        transfer_cp(&mut env, &a, &extranjero.pubkey(), &campo, 1),
        "ExtranjeroNoPermitido",
    );
}

#[test]
fn flujo4_pool_a_nav_con_guardia_pyth() {
    let mut env = setup();
    let edificio = create_fideicomiso(&mut env, AssetType::Inmueble, 10_000);
    create_pool(&mut env, &edificio, 100); // spread 1%
    add_liquidity(&mut env, &edificio, 100, 20_000 * USDC);

    let user = investor(&mut env, Residency::Argentina, 10_000 * USDC);
    buy(&mut env, &user, &edificio, 20).unwrap();
    let user_usdc = ata(&user.pubkey(), &env.usdc_mint, &TOKEN);
    let user_cp = ata(&user.pubkey(), &edificio, &TOKEN_2022);

    // Vende 10 CP al NAV (100 USDC) - 1% = 990 USDC.
    let before = token_balance(&env.svm, &user_usdc);
    swap(&mut env, &user, &edificio, SwapSide::Vender, 10, 990 * USDC).unwrap();
    assert_eq!(token_balance(&env.svm, &user_usdc) - before, 990 * USDC);
    assert_eq!(token_balance(&env.svm, &user_cp), 10);

    // Limite de precio.
    expect_err(
        swap(&mut env, &user, &edificio, SwapSide::Vender, 1, 100 * USDC),
        "LimiteDePrecio",
    );

    // El fiduciario publica un NAV nuevo (+10%): compra 5 CP a 110 + 1%.
    update_nav(&mut env, &edificio, 110 * USDC).unwrap();
    let before = token_balance(&env.svm, &user_usdc);
    swap(&mut env, &user, &edificio, SwapSide::Comprar, 5, 556 * USDC).unwrap();
    assert_eq!(before - token_balance(&env.svm, &user_usdc), 555_500_000);
    assert_eq!(token_balance(&env.svm, &user_cp), 15);
    expect_err(update_nav(&mut env, &edificio, 300 * USDC), "NavFueraDeRango");

    // Guardia Pyth: USDC despegado o precio viejo pausan el pool.
    let price_update = env.price_update;
    set_usdc_price(&mut env.svm, price_update, 97_000_000, NOW - 60);
    expect_err(
        swap(&mut env, &user, &edificio, SwapSide::Vender, 1, 0),
        "UsdcDespegado",
    );
    set_usdc_price(&mut env.svm, price_update, 100_000_000, NOW - 3_600);
    expect_err(
        swap(&mut env, &user, &edificio, SwapSide::Vender, 1, 0),
        "OraculoDesactualizado",
    );

    // Sin KYC no se opera con el pool.
    set_usdc_price(&mut env.svm, price_update, 100_000_000, NOW - 60);
    let sin_kyc = new_wallet(&mut env);
    fund_usdc(&mut env, &sin_kyc.pubkey(), 1_000 * USDC);
    expect_err(
        swap(&mut env, &sin_kyc, &edificio, SwapSide::Comprar, 1, 200 * USDC),
        "SinKyc",
    );
}

#[test]
fn flujo5_distribucion_de_renta() {
    let mut env = setup();
    let edificio = create_fideicomiso(&mut env, AssetType::Inmueble, 1_000);
    let a = investor(&mut env, Residency::Argentina, 10_000 * USDC);
    let b = investor(&mut env, Residency::Extranjero, 10_000 * USDC);
    buy(&mut env, &a, &edificio, 30).unwrap();
    buy(&mut env, &b, &edificio, 10).unwrap();

    // 1.000 USDC de alquileres (ARS 1.530.000 al oficial 1.530).
    let distribution = start_distribution(&mut env, &edificio, 1_000 * USDC, 15_300_000);
    let stored: Distribution = load(&env.svm, &distribution);
    assert_eq!(stored.supply_snapshot, 40);
    assert_eq!(stored.ars_per_usd, 15_300_000);

    // Snapshot: durante la distribucion no hay transferencias ni suscripciones.
    expect_err(transfer_cp(&mut env, &a, &b.pubkey(), &edificio, 1), "TransferenciasBloqueadas");
    expect_err(buy(&mut env, &a, &edificio, 1), "TransferenciasBloqueadas");

    // El admin paga a A (push). Un tercero no puede cobrar por B; B reclama lo suyo (claim).
    let admin = env.admin.insecure_clone();
    pay_dividend(&mut env, &admin, &edificio, &distribution, &a.pubkey()).unwrap();
    let tercero = new_wallet(&mut env);
    expect_err(
        pay_dividend(&mut env, &tercero, &edificio, &distribution, &b.pubkey()),
        "NoAutorizado",
    );
    pay_dividend(&mut env, &b, &edificio, &distribution, &b.pubkey()).unwrap();
    let a_usdc = ata(&a.pubkey(), &env.usdc_mint, &TOKEN);
    let b_usdc = ata(&b.pubkey(), &env.usdc_mint, &TOKEN);
    assert_eq!(token_balance(&env.svm, &a_usdc), 10_000 * USDC - 30 * PRICE_PER_CP + 750 * USDC);
    assert_eq!(token_balance(&env.svm, &b_usdc), 10_000 * USDC - 10 * PRICE_PER_CP + 250 * USDC);

    // Sin doble pago: el recibo Payout ya existe.
    assert!(pay_dividend(&mut env, &admin, &edificio, &distribution, &a.pubkey()).is_err());

    close_distribution(&mut env, &edificio, &distribution);
    let stored: Distribution = load(&env.svm, &distribution);
    assert!(stored.closed);
    assert_eq!(stored.paid_usdc, 1_000 * USDC);
    transfer_cp(&mut env, &a, &b.pubkey(), &edificio, 1).unwrap();
}
