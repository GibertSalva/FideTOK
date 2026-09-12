"use client";

import { fidetok } from "@fidetok/client";
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { address, type Address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import Link from "next/link";
import { use, useState } from "react";

import { useFideTok, useSession } from "@/components/providers";
import { TxResult, type TxState } from "@/components/tx-result";
import { Badge, Button, Card, Field, Input, LegalTag, Notice, Stat, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, PYTH_USDC_USD, explorer, usdcMint } from "@/lib/config";
import { DETALLE_LABELS, type FideicomisoPublico } from "@/lib/fideicomisos";
import { formatInt, formatUsd, formatUsdc, shortAddress } from "@/lib/format";
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

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <div className="h-96 animate-pulse rounded-2xl bg-white/5" />;
  const { info, state } = data;
  if (!info || !state) return <Notice tone="warning">No encontramos este fideicomiso.</Notice>;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/mercado" className="text-sm text-slate-500 hover:text-slate-300">
            ← Mercado
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{info.nombre}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={info.asset_type === "rural" ? "warning" : "info"}>{ASSET_LABELS[info.asset_type]}</Badge>
            <span className="font-mono text-xs text-slate-500">{info.simbolo}</span>
            {state.restrictForeign && <LegalTag>Ley 26.737</LegalTag>}
            {state.transfersLocked && <Badge tone="warning">Distribución en curso</Badge>}
          </div>
        </div>
        <a className="font-mono text-xs text-emerald-300 hover:underline" href={explorer.address(mint)} target="_blank" rel="noreferrer">
          mint {shortAddress(mint, 6)} ↗
        </a>
      </div>

      <Card className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Valuación" value={formatUsd(info.valuacion_usd)} />
        <Stat label="Precio de emisión" value={formatUsdc(state.pricePerToken)} sub="por certificado" />
        <Stat
          label="Valor cuotaparte (NAV)"
          value={formatUsdc(state.navPerToken)}
          sub={`publicado ${new Date(Number(state.navUpdatedAt) * 1000).toLocaleDateString("es-AR")}`}
        />
        <Stat label="Suscriptos" value={`${formatInt(state.sold)} / ${formatInt(state.maxSupply)}`} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Suscripcion mint={mint} state={state} usdcBalance={data.usdcBalance} onDone={reload} />
        <Pool mint={mint} nav={state.navPerToken} pool={data.pool} oracle={data.oracle} cpBalance={data.cpBalance} onDone={reload} />
      </div>

      <Card className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold text-white">El activo</h3>
          {info.descripcion && <p className="text-sm text-slate-400">{info.descripcion}</p>}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries(info.detalle_activo ?? {})
              .filter(([, value]) => value)
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-slate-500">{DETALLE_LABELS[key] ?? key}</dt>
                  <dd className="text-slate-200">{value}</dd>
                </div>
              ))}
          </dl>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">Datos legales on-chain</h3>
            <LegalTag>CCyC · AFIP</LegalTag>
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">CUIT del fideicomiso</dt>
              <dd className="text-slate-200">{info.cuit_fideicomiso}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Registro del activo</dt>
              <dd className="text-slate-200">{info.registro || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">sha256 del contrato firmado</dt>
              <dd className="break-all font-mono text-xs text-slate-300">{info.contrato_sha256}</dd>
            </div>
          </dl>
          <Link href={`/verificar/${mint}`} className="text-sm font-semibold text-emerald-300 hover:underline">
            Verificar el contrato contra la blockchain →
          </Link>
        </div>
      </Card>
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

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Suscripción primaria</h3>
        <LegalTag>Flujo 3</LegalTag>
      </div>
      <p className="text-sm text-slate-400">
        Pagás en USDC al precio de emisión y el contrato acuña tus certificados después de validar tu KYC.
      </p>
      <Field label="Certificados" hint={`Disponibles: ${formatInt(available)} · Tu saldo: ${formatUsdc(usdcBalance)}`}>
        <Input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
        <span className="text-slate-400">Total a pagar</span>
        <span className="font-semibold text-white tabular-nums">{formatUsdc(cost)}</span>
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
      {blockedForeign && <Notice tone="warning">Activo rural: la Ley 26.737 no permite suscribir a no residentes. El contrato rechazaría la operación.</Notice>}
      <Button onClick={buy} loading={busy} disabled={!access.ok || cp <= 0n || cp > available || state.transfersLocked}>
        Suscribir con USDC
      </Button>
      <TxResult state={result} />
    </Card>
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
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Pool de liquidez</h3>
          <LegalTag>Flujo 4</LegalTag>
        </div>
        <p className="text-sm text-slate-400">El fiduciario todavía no abrió el pool de este fideicomiso.</p>
      </Card>
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
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Pool de liquidez</h3>
        <LegalTag>Flujo 4</LegalTag>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
        {(["vender", "comprar"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setSide(value)}
            className={cn(
              "rounded-lg py-2 text-sm font-medium capitalize transition-colors",
              side === value ? "bg-panel-2 text-white" : "text-slate-400 hover:text-white",
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <Field label="Certificados" hint={`Tenés ${formatInt(cpBalance)} · Reservas del pool: ${formatInt(pool.cpReserve)} CP / ${formatUsdc(pool.usdcReserve)}`}>
        <Input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-1.5 rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">{side === "vender" ? "Recibís" : "Pagás"}</span>
          <span className="font-semibold text-white tabular-nums">{formatUsdc(quote)}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>NAV {formatUsdc(nav)} · spread {(pool.spreadBps / 100).toFixed(2)}%</span>
          <span className={oracleOk ? "text-emerald-300" : "text-rose-300"}>
            {oracle ? `Pyth USDC ${oracle.price.toFixed(4)} · hace ${oracleAge}s` : "Oráculo no disponible"}
          </span>
        </div>
      </div>
      {!access.ok && <Notice tone="warning">{access.reason}</Notice>}
      {!oracleOk && oracle && <Notice tone="warning">La guardia de Pyth pausa el pool: precio viejo o USDC fuera de paridad.</Notice>}
      <Button onClick={swap} loading={busy} disabled={!access.ok || cp <= 0n || !liquidityOk || (side === "vender" && cp > cpBalance)}>
        {side === "vender" ? "Vender al pool" : "Comprar al pool"}
      </Button>
      {!liquidityOk && cp > 0n && <span className="text-xs text-amber-200">Liquidez insuficiente en el pool.</span>}
      <TxResult state={result} />
    </Card>
  );
}
