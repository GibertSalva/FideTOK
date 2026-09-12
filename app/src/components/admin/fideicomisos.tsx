"use client";

import { fidetok } from "@fidetok/client";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { address } from "@solana/kit";
import { useState } from "react";

import { useFideTok } from "@/components/providers";
import { TxResult, type TxState } from "@/components/tx-result";
import { Badge, Button, Card, Field, Input, Notice, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, USDC_UNIT, usdcMint } from "@/lib/config";
import type { FideicomisoPublico } from "@/lib/fideicomisos";
import { formatInt, formatUsdc, usdcToBase } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { describeError } from "@/lib/solana/errors";
import { fetchFideicomisoState, fetchPoolState } from "@/lib/solana/onchain";
import { sendTx } from "@/lib/solana/tx";

export function FideicomisosAdmin() {
  const client = useFideTok();
  const { data, error, reload } = useLoader(async () => {
    const list = await api<FideicomisoPublico[]>("/api/fideicomisos");
    return Promise.all(
      list.map(async (f) => {
        const mint = address(f.mint);
        const [state, pool] = await Promise.all([
          fetchFideicomisoState(client.rpc, mint),
          fetchPoolState(client.rpc, mint, usdcMint(), TOKEN_PROGRAM_ADDRESS),
        ]);
        return { info: f, state, pool };
      }),
    );
  }, [client]);

  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-white/5" />;
  if (data.length === 0) return <Card className="text-sm text-slate-400">Todavía no hay fideicomisos emitidos.</Card>;
  return (
    <div className="flex flex-col gap-4">
      {data.map((item) => (
        <FideicomisoAdminCard key={item.info.id} {...item} onChange={reload} />
      ))}
    </div>
  );
}

type Props = {
  info: FideicomisoPublico;
  state: Awaited<ReturnType<typeof fetchFideicomisoState>>;
  pool: Awaited<ReturnType<typeof fetchPoolState>>;
  onChange: () => Promise<void>;
};

function FideicomisoAdminCard({ info, state, pool, onChange }: Props) {
  const client = useFideTok();
  const mint = address(info.mint);
  const [nav, setNav] = useState("");
  const [spread, setSpread] = useState("1");
  const [liqCp, setLiqCp] = useState("100");
  const [liqUsdc, setLiqUsdc] = useState("10000");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<TxState>(null);

  async function run(key: string, action: () => Promise<{ message: string; signature: string }>) {
    setBusy(key);
    setResult(null);
    try {
      const { message, signature } = await action();
      setResult({ kind: "ok", message, signature });
      await onChange();
    } catch (e) {
      setResult({ kind: "error", message: describeError(e) });
    } finally {
      setBusy(null);
    }
  }

  if (!state) return <Notice tone="warning">{info.nombre}: no se encontró la cuenta on-chain.</Notice>;

  const publishNav = () =>
    run("nav", async () => {
      const navPerToken = usdcToBase(Number(nav));
      const ix = fidetok.getUpdateNavInstruction({
        admin: client.payer,
        config: (await fidetok.findConfigPda())[0],
        fideicomiso: state.address,
        navPerToken,
      });
      const signature = await sendTx(client, [ix]);
      await api("/api/admin/navs", { json: { mint: info.mint, nav_usdc: Number(nav), tx: signature } });
      return { message: `NAV publicado: ${formatUsdc(navPerToken)}.`, signature };
    });

  const createPool = () =>
    run("pool", async () => {
      const ix = await fidetok.getCreatePoolInstructionAsync({
        admin: client.payer,
        mint,
        usdcMint: usdcMint(),
        usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
        spreadBps: Math.round(Number(spread) * 100),
      });
      return { message: "Pool creado y habilitado en la whitelist.", signature: await sendTx(client, [ix]) };
    });

  const addLiquidity = () =>
    run("liq", async () => {
      const usdc = usdcMint();
      const [adminUsdcAccount] = await findAssociatedTokenPda({ owner: client.payer.address, mint: usdc, tokenProgram: TOKEN_PROGRAM_ADDRESS });
      const ix = await fidetok.getAddLiquidityInstructionAsync({
        admin: client.payer,
        mint,
        usdcMint: usdc,
        adminUsdcAccount,
        usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
        cpAmount: BigInt(Math.floor(Number(liqCp) || 0)),
        usdcAmount: usdcToBase(Number(liqUsdc) || 0),
      });
      return { message: "Liquidez agregada al pool.", signature: await sendTx(client, [ix]) };
    });

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">{info.nombre}</h3>
          <Badge tone={info.asset_type === "rural" ? "warning" : "info"}>{ASSET_LABELS[info.asset_type]}</Badge>
        </div>
        {state.transfersLocked && <Badge tone="warning">Distribución abierta</Badge>}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="NAV" value={formatUsdc(state.navPerToken)} />
        <Stat label="Suscriptos" value={`${formatInt(state.sold)} / ${formatInt(state.maxSupply)}`} />
        <Stat label="Pool CP" value={pool ? formatInt(pool.cpReserve) : "—"} />
        <Stat label="Pool USDC" value={pool ? formatUsdc(pool.usdcReserve) : "—"} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Field label="Nuevo valor cuotaparte (USDC)" hint="Máximo ±50% por publicación">
            <Input type="number" min={0} step="any" value={nav} onChange={(e) => setNav(e.target.value)} placeholder={String(Number(state.navPerToken) / Number(USDC_UNIT))} />
          </Field>
          <Button variant="secondary" onClick={publishNav} loading={busy === "nav"} disabled={!Number(nav)}>
            Publicar NAV
          </Button>
        </div>
        {pool ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Certificados al pool" hint="Se suscriben al precio de emisión">
                <Input type="number" min={0} step={1} value={liqCp} onChange={(e) => setLiqCp(e.target.value)} />
              </Field>
              <Field label="USDC para recompras">
                <Input type="number" min={0} step="any" value={liqUsdc} onChange={(e) => setLiqUsdc(e.target.value)} />
              </Field>
            </div>
            <Button variant="secondary" onClick={addLiquidity} loading={busy === "liq"}>
              Agregar liquidez
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Field label="Spread del pool (%)" hint="El pool compra y vende al NAV ± spread">
              <Input type="number" min={0} max={10} step="0.1" value={spread} onChange={(e) => setSpread(e.target.value)} />
            </Field>
            <Button variant="secondary" onClick={createPool} loading={busy === "pool"}>
              Crear pool de liquidez
            </Button>
          </div>
        )}
      </div>
      <TxResult state={result} />
    </Card>
  );
}
