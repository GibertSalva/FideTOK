"use client";

import { fidetok } from "@fidetok/client";
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { address, type Address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import Link from "next/link";
import { use, useState } from "react";

import { AssetTile, IconUsdc } from "@/components/icons";
import { useFideTok, useSession } from "@/components/providers";
import { TxResult, type TxState } from "@/components/tx-result";
import {
  Badge,
  Button,
  DataRow,
  Delta,
  Display,
  Field,
  Input,
  Kicker,
  LegalTag,
  Meter,
  Notice,
  Section,
  StatCell,
  cn,
} from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, PYTH_USDC_USD, USDC_UNIT, explorer, usdcMint } from "@/lib/config";
import { DETALLE_LABELS, type FideicomisoPublico } from "@/lib/fideicomisos";
import { formatInt, formatMoney, formatUsdc, formatUsdcMoney, shortAddress } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { describeError } from "@/lib/solana/errors";
import { fetchFideicomisoState, fetchPoolState, fetchTokenBalance, fetchUsdcOracle } from "@/lib/solana/onchain";
import { sendTx } from "@/lib/solana/tx";

const BPS = 10_000n;

export default function FideicomisoPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint: mintParam } = use(params);
  const mint = address(mintParam);
  const client = useFideTok();
  const connected = useConnectedWallet(client);
  const owner = connected ? address(connected.account.address) : null;

  const { data, error, reload } = useLoader(async () => {
    const usdc = usdcMint();
    const [list, state, pool, oracle, cpBalance, usdcBalance] = await Promise.all([
      api<FideicomisoPublico[]>("/api/fideicomisos"),
      fetchFideicomisoState(client.rpc, mint),
      fetchPoolState(client.rpc, mint, usdc, TOKEN_PROGRAM_ADDRESS),
      fetchUsdcOracle(client.rpc),
      owner ? fetchTokenBalance(client.rpc, owner, mint, TOKEN_2022_PROGRAM_ADDRESS) : Promise.resolve(0n),
      owner ? fetchTokenBalance(client.rpc, owner, usdc, TOKEN_PROGRAM_ADDRESS) : Promise.resolve(0n),
    ]);
    return { info: list.find((f) => f.mint === mint) ?? null, state, pool, oracle, cpBalance, usdcBalance };
  }, [client, mint, owner]);

  if (error)
    return (
      <Section>
        <Notice tone="danger">{error}</Notice>
      </Section>
    );
  if (!data) return <div className="my-8 h-96 animate-pulse rounded-card bg-surface" />;
  const { info, state } = data;
  if (!info || !state)
    return (
      <Section>
        <Notice tone="warning">No encontramos este fideicomiso.</Notice>
      </Section>
    );

  const sold = Number(state.sold);
  const max = Number(state.maxSupply);
  const pct = max > 0 ? (sold / max) * 100 : 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="py-6">
        <Link href="/mercado" className="text-[12px] uppercase tracking-[0.18em] text-mute hover:text-acid">
          ← Mercado
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <AssetTile type={info.asset_type} size={32} />
          <Badge tone={info.asset_type === "rural" ? "warning" : "info"}>{ASSET_LABELS[info.asset_type]}</Badge>
          <span className="text-[11.5px] uppercase tracking-[0.18em] text-mute">{info.simbolo}</span>
          {state.restrictForeign && <LegalTag>Ley 26.737</LegalTag>}
          {state.transfersLocked && <Badge tone="warning">Distribución en curso</Badge>}
        </div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
          <Display size="xl" as="h1">
            {info.nombre}
          </Display>
          <a
            className="pb-2 text-[12px] tracking-[0.06em] text-acid hover:underline"
            href={explorer.address(mint)}
            target="_blank"
            rel="noreferrer"
          >
            mint {shortAddress(mint, 6)} ↗
          </a>
        </div>

        <div className="mt-7 flex flex-wrap items-end gap-8">
          <div>
            <Kicker>USDC · Cuotaparte (NAV)</Kicker>
            <div className="mt-2 flex items-center gap-3">
              <IconUsdc size={28} className="shrink-0 text-mute" />
              <span className="text-[clamp(40px,7vw,88px)] font-medium leading-[0.95] tracking-[-0.02em] tabular-nums text-acid">
                {formatUsdcMoney(state.navPerToken)}
              </span>
            </div>
            <div className="mt-2 text-[11px] tracking-[0.02em] text-dim">
              publicado {new Date(Number(state.navUpdatedAt) * 1000).toLocaleDateString("es-AR")}
            </div>
          </div>
          <div className="pb-2.5">
            <Kicker>Variación vs. emisión</Kicker>
            <div className="mt-2 text-[clamp(22px,4.5vw,34px)] font-medium leading-none">
              <Delta value={(Number(state.navPerToken) - Number(state.pricePerToken)) / Number(USDC_UNIT)} />
            </div>
          </div>
        </div>

        <div className="mt-7 max-w-3xl">
          <Meter pct={pct} />
          <div className="mt-2.5 flex flex-wrap justify-between gap-4 text-[12px] uppercase tracking-[0.14em]">
            <span>{pct.toFixed(0)}% suscripto</span>
            <span className="text-mute">
              {formatInt(state.sold)} de {formatInt(state.maxSupply)} cuotapartes
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 pb-6 md:grid-cols-3">
        <StatCell
          label="Valuación del bien"
          value={formatMoney(info.valuacion_usd)}
          className="rounded-card bg-surface shadow-card"
        />
        <StatCell
          label="Precio de emisión"
          value={formatUsdcMoney(state.pricePerToken)}
          className="rounded-card bg-surface shadow-card"
        />
        <StatCell
          label="Disponibles"
          value={formatInt(state.maxSupply - state.sold)}
          tone="acid"
          className="rounded-card bg-surface shadow-card"
        />
      </div>

      <div className="grid gap-3 pb-6 lg:grid-cols-2">
        <div className="rounded-card bg-surface shadow-card">
          <Suscripcion mint={mint} state={state} usdcBalance={data.usdcBalance} onDone={reload} />
        </div>
        <div className="rounded-card bg-surface shadow-card">
          <Pool mint={mint} nav={state.navPerToken} pool={data.pool} oracle={data.oracle} cpBalance={data.cpBalance} onDone={reload} />
        </div>
      </div>

      <div className="grid gap-3 pb-6 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-card bg-surface px-6 py-6 shadow-card">
          <Kicker>El activo</Kicker>
          {info.descripcion && (
            <p className="max-w-xl text-[12.5px] leading-[1.7] tracking-[0.03em] text-mute">{info.descripcion}</p>
          )}
          <div className="mt-2">
            {Object.entries(info.detalle_activo ?? {})
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <DataRow key={key} k={DETALLE_LABELS[key] ?? key} v={value} />
              ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-card bg-surface px-6 py-6 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <Kicker>Datos legales on-chain</Kicker>
            <LegalTag>CCyC · AFIP</LegalTag>
          </div>
          <div className="mt-2">
            <DataRow k="CUIT del fideicomiso" v={info.cuit_fideicomiso} />
            <DataRow k="Registro del activo" v={info.registro || "—"} />
            <DataRow
              k="sha256 del contrato"
              v={<span className="break-all text-[11px] tracking-normal">{info.contrato_sha256}</span>}
            />
          </div>
          <Link
            href={`/verificar/${mint}`}
            className="mt-2 text-[12px] uppercase tracking-[0.18em] text-acid hover:underline"
          >
            Verificar el contrato contra la blockchain →
          </Link>
        </div>
      </div>
    </div>
  );
}

type FideicomisoState = NonNullable<Awaited<ReturnType<typeof fetchFideicomisoState>>>;

function useCanInvest() {
  const { me } = useSession();
  if (!me?.session) return { ok: false, reason: "Ingresá con tu wallet para invertir." };
  if (me.kyc?.status !== "aprobado") return { ok: false, reason: "Necesitás el KYC aprobado para operar.", kyc: true };
  return { ok: true, reason: null, residenteAr: me.kyc.residente_ar };
}

function Suscripcion({
  mint,
  state,
  usdcBalance,
  onDone,
}: {
  mint: Address;
  state: FideicomisoState;
  usdcBalance: bigint;
  onDone: () => Promise<void>;
}) {
  const client = useFideTok();
  const access = useCanInvest();
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TxState>(null);
  const cp = BigInt(Math.max(0, Math.floor(Number(amount) || 0)));
  const cost = cp * state.pricePerToken;
  const available = state.maxSupply - state.sold;
  const blockedForeign = state.restrictForeign && access.ok && access.residenteAr === false;

  async function buy() {
    setBusy(true);
    setResult(null);
    try {
      const usdc = usdcMint();
      const [investorUsdcAccount] = await findAssociatedTokenPda({ owner: client.payer.address, mint: usdc, tokenProgram: TOKEN_PROGRAM_ADDRESS });
      const ix = await fidetok.getBuyPrimaryInstructionAsync({
        investor: client.payer,
        mint,
        usdcMint: usdc,
        investorUsdcAccount,
        priceUpdate: PYTH_USDC_USD,
        usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
        cpAmount: cp,
        maxUsdc: cost,
      });
      const signature = await sendTx(client, [ix]);
      setResult({ kind: "ok", message: `Suscribiste ${formatInt(cp)} certificados.`, signature });
      await onDone();
    } catch (e) {
      setResult({ kind: "error", message: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  const step = (delta: number) => setAmount(String(Math.max(0, Math.floor(Number(amount) || 0) + delta)));

  return (
    <div className="flex h-full flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Kicker>Suscripción primaria</Kicker>
        <LegalTag>Flujo 3</LegalTag>
      </div>
      <p className="max-w-xl text-[12.5px] leading-[1.7] tracking-[0.03em] text-mute">
        Pagás en USDC al precio de emisión y el contrato acuña tus certificados después de validar tu KYC.
      </p>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
        <div>
          <Kicker>Cuotapartes</Kicker>
          <div className="mt-3 flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => step(-1)}
              className="grid size-11 place-items-center rounded-pill bg-surface-2 text-xl text-mute shadow-card transition-all hover:bg-surface-3 hover:text-acid"
              aria-label="Restar una cuotaparte"
            >
              −
            </button>
            <Input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-[132px] text-center text-[22px] font-semibold tabular-nums"
            />
            <button
              type="button"
              onClick={() => step(1)}
              className="grid size-11 place-items-center rounded-pill bg-surface-2 text-xl text-mute shadow-card transition-all hover:bg-surface-3 hover:text-acid"
              aria-label="Sumar una cuotaparte"
            >
              +
            </button>
          </div>
        </div>
        <div>
          <Kicker>Precio unitario</Kicker>
          <div className="mt-2 text-[clamp(22px,4.5vw,30px)] font-medium leading-none tabular-nums">
            {formatUsdcMoney(state.pricePerToken)}
          </div>
        </div>
        <div>
          <Kicker>Total a pagar</Kicker>
          <div className="mt-2 text-[clamp(22px,4.5vw,30px)] font-medium leading-none tabular-nums text-acid">
            {formatUsdcMoney(cost)}
          </div>
        </div>
      </div>

      <div className="text-[11px] tracking-[0.02em] text-dim">
        Disponibles {formatInt(available)} · tu saldo {formatUsdc(usdcBalance)}
      </div>

      {!access.ok && (
        <Notice tone="warning">
          {access.reason}{" "}
          {access.kyc && (
            <Link className="font-semibold underline" href="/kyc">
              Verificarme
            </Link>
          )}
        </Notice>
      )}
      {blockedForeign && (
        <Notice tone="warning">
          Activo rural: la Ley 26.737 no permite suscribir a no residentes. El contrato rechazaría la operación.
        </Notice>
      )}
      <Button
        className="mt-auto h-12 w-full"
        onClick={buy}
        loading={busy}
        disabled={!access.ok || cp <= 0n || cp > available || state.transfersLocked}
      >
        Confirmar suscripción
      </Button>
      <TxResult state={result} />
    </div>
  );
}

function Pool({
  mint,
  nav,
  pool,
  oracle,
  cpBalance,
  onDone,
}: {
  mint: Address;
  nav: bigint;
  pool: Awaited<ReturnType<typeof fetchPoolState>>;
  oracle: Awaited<ReturnType<typeof fetchUsdcOracle>>;
  cpBalance: bigint;
  onDone: () => Promise<void>;
}) {
  const client = useFideTok();
  const access = useCanInvest();
  const [side, setSide] = useState<"vender" | "comprar">("vender");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TxState>(null);

  if (!pool) {
    return (
      <div className="flex h-full flex-col gap-3 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Kicker>Pool de liquidez</Kicker>
          <LegalTag>Flujo 4</LegalTag>
        </div>
        <p className="text-[12.5px] tracking-[0.02em] text-mute">
          El fiduciario todavía no abrió el pool de este fideicomiso.
        </p>
      </div>
    );
  }

  const cp = BigInt(Math.max(0, Math.floor(Number(amount) || 0)));
  const spread = BigInt(pool.spreadBps);
  // Mismas cuentas que el programa: vender redondea para abajo, comprar para arriba.
  const quote = side === "vender" ? (cp * nav * (BPS - spread)) / BPS : (cp * nav * (BPS + spread) + BPS - 1n) / BPS;
  const oracleAge = oracle?.ageSeconds ?? null;
  const oracleOk = oracle !== null && Math.abs(oracle.price - 1) <= 0.02 && (oracleAge ?? Infinity) <= 900;
  const liquidityOk = side === "vender" ? pool.usdcReserve >= quote : pool.cpReserve >= cp;

  async function swap() {
    setBusy(true);
    setResult(null);
    try {
      const usdc = usdcMint();
      const [userUsdcAccount] = await findAssociatedTokenPda({ owner: client.payer.address, mint: usdc, tokenProgram: TOKEN_PROGRAM_ADDRESS });
      const createUsdcAta = getCreateAssociatedTokenIdempotentInstruction({
        payer: client.payer,
        owner: client.payer.address,
        mint: usdc,
        ata: userUsdcAccount,
      });
      const ix = await fidetok.getSwapInstructionAsync({
        user: client.payer,
        mint,
        usdcMint: usdc,
        userUsdcAccount,
        priceUpdate: PYTH_USDC_USD,
        usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
        side: side === "vender" ? fidetok.SwapSide.Vender : fidetok.SwapSide.Comprar,
        cpAmount: cp,
        limitUsdc: quote,
      });
      const signature = await sendTx(client, [createUsdcAta, ix]);
      setResult({
        kind: "ok",
        message: side === "vender" ? `Vendiste ${cp} certificados por ${formatUsdc(quote)}.` : `Compraste ${cp} certificados.`,
        signature,
      });
      await onDone();
    } catch (e) {
      setResult({ kind: "error", message: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Kicker>Pool de liquidez · salida anticipada</Kicker>
        <LegalTag>Flujo 4</LegalTag>
      </div>

      <div className="flex gap-1 rounded-pill bg-surface-2 p-1">
        {(["vender", "comprar"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setSide(value)}
            className={cn(
              "flex-1 rounded-pill py-2.5 text-[12px] uppercase tracking-[0.14em] transition-all",
              side === value
                ? "bg-acid font-semibold text-ink"
                : "text-mute hover:bg-surface-3 hover:text-bone",
            )}
          >
            {value}
          </button>
        ))}
      </div>

      <Field
        label="Certificados"
        hint={`Tenés ${formatInt(cpBalance)} · reservas del pool: ${formatInt(pool.cpReserve)} CP / ${formatUsdc(pool.usdcReserve)}`}
      >
        <Input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>

      <div className="rounded-card bg-surface-2 px-4 py-3">
        <div className="flex items-end justify-between gap-4">
          <Kicker>{side === "vender" ? "Recibís" : "Pagás"}</Kicker>
          <span className="text-[clamp(20px,4.5vw,26px)] font-medium leading-none tabular-nums text-acid">
            {formatUsdcMoney(quote)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-[10.5px] uppercase tracking-[0.12em] text-dim">
          <span>
            NAV {formatUsdc(nav)} · spread {(pool.spreadBps / 100).toFixed(2)}%
          </span>
          <span className={oracleOk ? "text-up" : "text-down"}>
            {oracle ? `Pyth USDC ${oracle.price.toFixed(4)} · hace ${oracleAge}s` : "Oráculo no disponible"}
          </span>
        </div>
      </div>

      {!access.ok && <Notice tone="warning">{access.reason}</Notice>}
      {!oracleOk && oracle && (
        <Notice tone="warning">La guardia de Pyth pausa el pool: precio viejo o USDC fuera de paridad.</Notice>
      )}
      {!liquidityOk && cp > 0n && (
        <span className="text-[11px] uppercase tracking-[0.14em] text-acid">Liquidez insuficiente en el pool.</span>
      )}
      <Button
        className="mt-auto h-12 w-full"
        variant="secondary"
        onClick={swap}
        loading={busy}
        disabled={!access.ok || cp <= 0n || !liquidityOk || (side === "vender" && cp > cpBalance)}
      >
        {side === "vender" ? "Vender al pool" : "Comprar al pool"}
      </Button>
      <TxResult state={result} />
    </div>
  );
}
