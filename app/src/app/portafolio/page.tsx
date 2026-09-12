"use client";

import { fidetok, getTransferCpInstruction } from "@fidetok/client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { address, generateKeyPairSigner, isAddress, type Address } from "@solana/kit";
import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import Link from "next/link";
import { useState } from "react";

import { useFideTok, useSession } from "@/components/providers";
import { RequireSession } from "@/components/require-session";
import { TxResult, type TxState } from "@/components/tx-result";
import { Badge, Button, Card, Field, Input, LegalTag, Notice, PageHeader, Select, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { usdcMint } from "@/lib/config";
import type { FideicomisoPublico } from "@/lib/fideicomisos";
import { formatInt, formatUsdc } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { describeError } from "@/lib/solana/errors";
import { fetchFideicomisoState, fetchTokenBalance } from "@/lib/solana/onchain";
import { findDistributionPda } from "@/lib/solana/pdas";
import { sendTx } from "@/lib/solana/tx";

export default function PortafolioPage() {
  return (
    <>
      <PageHeader title="Mi portafolio" subtitle="Tus certificados, la renta que cobraste y las transferencias entre inversores verificados." />
      <RequireSession>
        <Portafolio />
      </RequireSession>
    </>
  );
}

function Portafolio() {
  const client = useFideTok();
  const connected = useConnectedWallet(client);
  const { me } = useSession();
  const owner = connected ? address(connected.account.address) : null;

  const { data, error, reload } = useLoader(async () => {
    if (!owner) return null;
    const usdc = usdcMint();
    const [list, sol, usdcBalance] = await Promise.all([
      api<FideicomisoPublico[]>("/api/fideicomisos"),
      client.rpc.getBalance(owner).send(),
      fetchTokenBalance(client.rpc, owner, usdc, TOKEN_PROGRAM_ADDRESS),
    ]);
    const holdings = await Promise.all(
      list.map(async (info) => {
        const mint = address(info.mint);
        const [state, balance] = await Promise.all([
          fetchFideicomisoState(client.rpc, mint),
          fetchTokenBalance(client.rpc, owner, mint, TOKEN_2022_PROGRAM_ADDRESS),
        ]);
        const rentas = state ? await fetchRentas(client, state.address, state.distributionCount, owner) : [];
        return { info, state, balance, rentas };
      }),
    );
    return { sol: sol.value, usdcBalance, holdings };
  }, [client, owner]);

  if (!owner) return <Notice tone="warning">Conectá la wallet con la que ingresaste.</Notice>;
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-white/5" />;

  const conTenencia = data.holdings.filter((h) => h.balance > 0n || h.rentas.length > 0);
  const valorTotal = data.holdings.reduce((acc, h) => acc + h.balance * (h.state?.navPerToken ?? 0n), 0n);

  return (
    <div className="flex flex-col gap-6">
      <Card className="grid gap-6 sm:grid-cols-4">
        <Stat label="Valor a NAV" value={formatUsdc(valorTotal)} />
        <Stat label="USDC disponible" value={formatUsdc(data.usdcBalance)} />
        <Stat label="SOL (fees)" value={(Number(data.sol) / 1e9).toFixed(3)} />
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-500">KYC</span>
          {me?.kyc?.status === "aprobado" ? (
            <Badge tone="success">Aprobado</Badge>
          ) : (
            <Link href="/kyc" className="text-sm font-semibold text-amber-200 hover:underline">
              Completar verificación →
            </Link>
          )}
        </div>
      </Card>

      <Faucet onDone={reload} />

      <Card className="flex flex-col gap-4">
        <h3 className="font-semibold text-white">Certificados y renta</h3>
        {conTenencia.length === 0 && (
          <p className="text-sm text-slate-500">
            Todavía no tenés certificados.{" "}
            <Link href="/mercado" className="text-emerald-300 hover:underline">
              Ver el mercado
            </Link>
          </p>
        )}
        {conTenencia.map((h) => (
          <div key={h.info.mint} className="flex flex-col gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/mercado/${h.info.mint}`} className="font-medium text-slate-100 hover:underline">
                {h.info.nombre}
              </Link>
              <span className="text-sm tabular-nums text-slate-300">
                {formatInt(h.balance)} CP · {formatUsdc(h.balance * (h.state?.navPerToken ?? 0n))}
              </span>
            </div>
            {h.rentas.map((r) => (
              <RentaRow key={r.index} renta={r} mint={address(h.info.mint)} owner={owner} balance={h.balance} onDone={reload} />
            ))}
          </div>
        ))}
      </Card>

      <Transferir holdings={data.holdings.filter((h) => h.balance > 0n)} onDone={reload} />
    </div>
  );
}

type Renta = Awaited<ReturnType<typeof fetchRentas>>[number];

async function fetchRentas(client: ReturnType<typeof useFideTok>, fideicomiso: Address, count: number, owner: Address) {
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const distribution = await findDistributionPda(fideicomiso, index);
      const [payoutPda] = await fidetok.findPayoutPda({ distribution, holder: owner });
      const [dist, payout] = await Promise.all([
        fidetok.fetchMaybeDistribution(client.rpc, distribution),
        fidetok.fetchMaybePayout(client.rpc, payoutPda),
      ]);
      return {
        index,
        distribution,
        closed: dist.exists ? dist.data.closed : true,
        total: dist.exists ? dist.data.totalUsdc : 0n,
        arsPerUsd: dist.exists ? Number(dist.data.arsPerUsd) / 10_000 : 0,
        paid: payout.exists ? payout.data.amount : null,
      };
    }),
  );
}

function RentaRow({ renta, mint, owner, balance, onDone }: { renta: Renta; mint: Address; owner: Address; balance: bigint; onDone: () => Promise<void> }) {
  const client = useFideTok();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TxState>(null);

  async function reclamar() {
    setBusy(true);
    try {
      const ix = await fidetok.getPayDividendInstructionAsync({
        payer: client.payer,
        mint,
        distribution: renta.distribution,
        usdcMint: usdcMint(),
        holder: owner,
        usdcTokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      const signature = await sendTx(client, [ix]);
      setResult({ kind: "ok", message: "Cobraste tu parte de la renta.", signature });
      await onDone();
    } catch (e) {
      setResult({ kind: "error", message: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-slate-400">
          Distribución #{renta.index} · total {formatUsdc(renta.total)} · TC {renta.arsPerUsd}
        </span>
        {renta.paid !== null ? (
          <span className="font-semibold text-emerald-300">
            Cobraste {formatUsdc(renta.paid)} (≈ ARS {Math.round((Number(renta.paid) / 1e6) * renta.arsPerUsd).toLocaleString("es-AR")})
          </span>
        ) : !renta.closed && balance > 0n ? (
          <Button onClick={reclamar} loading={busy}>
            Reclamar mi renta
          </Button>
        ) : (
          <span className="text-slate-500">Sin participación</span>
        )}
      </div>
      <TxResult state={result} />
    </div>
  );
}

function Faucet({ onDone }: { onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TxState>(null);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-semibold text-white">Fondos de prueba (devnet)</h3>
        <p className="text-sm text-slate-400">1.000 USDC de prueba y SOL para las fees, para recorrer la demo.</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setResult(null);
            try {
              const { signature } = await api<{ signature: string }>("/api/faucet", { method: "POST" });
              setResult({ kind: "ok", message: "Fondos acreditados.", signature });
              await onDone();
            } catch (e) {
              setResult({ kind: "error", message: describeError(e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          Pedir fondos
        </Button>
        <TxResult state={result} />
      </div>
    </Card>
  );
}

function Transferir({
  holdings,
  onDone,
}: {
  holdings: Array<{ info: FideicomisoPublico; balance: bigint }>;
  onDone: () => Promise<void>;
}) {
  const client = useFideTok();
  const [mint, setMint] = useState<string>("");
  const [destino, setDestino] = useState("");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TxState>(null);
  const selected = mint || holdings[0]?.info.mint || "";

  if (holdings.length === 0) return null;

  async function transferir() {
    setBusy(true);
    setResult(null);
    try {
      if (!isAddress(destino)) throw new Error("Dirección de destino inválida");
      const mintAddress = address(selected);
      const destination = address(destino);
      const [destinationAta] = await findAssociatedTokenPda({ owner: destination, mint: mintAddress, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
      const signature = await sendTx(client, [
        getCreateAssociatedTokenIdempotentInstruction({
          payer: client.payer,
          owner: destination,
          mint: mintAddress,
          ata: destinationAta,
          tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        await getTransferCpInstruction({ mint: mintAddress, owner: client.payer, destinationOwner: destination, amount: BigInt(amount) }),
      ]);
      setResult({ kind: "ok", message: "Transferencia enviada a un inversor verificado.", signature });
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
        <h3 className="font-semibold text-white">Transferir certificados</h3>
        <LegalTag>CNV · oferta privada</LegalTag>
      </div>
      <p className="text-sm text-slate-400">
        Podés transferir a otro inversor con KYC. Si el destino no está verificado (por ejemplo, un exchange), el transfer
        hook del token rechaza la transacción en la red.
      </p>
      <div className="grid gap-4 md:grid-cols-[1fr_2fr_120px]">
        <Field label="Fideicomiso">
          <Select value={selected} onChange={(e) => setMint(e.target.value)}>
            {holdings.map((h) => (
              <option key={h.info.mint} value={h.info.mint}>
                {h.info.simbolo} ({formatInt(h.balance)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Wallet de destino">
          <Input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Dirección Solana" className="font-mono" />
        </Field>
        <Field label="Cantidad">
          <Input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={transferir} loading={busy} disabled={!destino}>
          Transferir
        </Button>
        <Button
          variant="ghost"
          onClick={async () => setDestino((await generateKeyPairSigner()).address)}
        >
          Probar con una wallet sin KYC
        </Button>
      </div>
      <TxResult state={result} />
    </Card>
  );
}
