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
import {
  Badge,
  Button,
  Display,
  Field,
  Input,
  Kicker,
  LegalTag,
  Notice,
  PageHeader,
  Section,
  Select,
  StatCell,
} from "@/components/ui";
import { api } from "@/lib/api";
import { ASSET_LABELS, usdcMint } from "@/lib/config";
import type { FideicomisoPublico } from "@/lib/fideicomisos";
import { formatInt, formatUsdc, formatUsdcMoney } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { describeError } from "@/lib/solana/errors";
import { fetchFideicomisoState, fetchTokenBalance } from "@/lib/solana/onchain";
import { findDistributionPda } from "@/lib/solana/pdas";
import { sendTx } from "@/lib/solana/tx";

export default function PortafolioPage() {
  return (
    <>
      <PageHeader
        kicker="Posición"
        title="Cartera"
        subtitle="Tus tenencias, la renta acreditada y las transferencias entre inversores habilitados."
      />
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

  if (!owner)
    return (
      <Section>
        <Notice tone="warning">Conectá la wallet con la que ingresaste.</Notice>
      </Section>
    );
  if (error)
    return (
      <Section>
        <Notice tone="danger">{error}</Notice>
      </Section>
    );
  if (!data) return <div className="my-8 h-64 animate-pulse rounded-card bg-surface" />;

  const conTenencia = data.holdings.filter((h) => h.balance > 0n || h.rentas.length > 0);
  const valorTotal = data.holdings.reduce((acc, h) => acc + h.balance * (h.state?.navPerToken ?? 0n), 0n);

  return (
    <div className="flex flex-col">
      <div className="grid gap-3 pb-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCell
          label="Valor de cartera"
          value={formatUsdcMoney(valorTotal)}
          tone="acid"
          className="rounded-card bg-surface shadow-card"
        />
        <StatCell
          label="USDC disponible"
          value={formatUsdcMoney(data.usdcBalance)}
          className="rounded-card bg-surface shadow-card"
        />
        <StatCell
          label="SOL para fees"
          value={(Number(data.sol) / 1e9).toFixed(3)}
          className="rounded-card bg-surface shadow-card"
        />
        <div className="min-w-0 rounded-card bg-surface px-6 py-5 shadow-card">
          <Kicker>Habilitación</Kicker>
          <div className="mt-4">
            {me?.kyc?.status === "aprobado" ? (
              <Badge tone="success">Habilitado para operar</Badge>
            ) : (
              <Link href="/kyc" className="text-[12.5px] uppercase tracking-[0.16em] text-acid hover:underline">
                Habilitarme →
              </Link>
            )}
          </div>
        </div>
      </div>

      <Faucet onDone={reload} />

      <div className="pb-6">
        <Kicker>Tenencias</Kicker>
        {conTenencia.length === 0 && (
          <p className="mt-4 text-[12.5px] tracking-[0.02em] text-mute">
            Todavía no tenés certificados.{" "}
            <Link href="/mercado" className="text-acid hover:underline">
              Ver el mercado →
            </Link>
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {conTenencia.map((h, i) => (
            <div key={h.info.mint} className="rounded-card bg-surface px-6 py-5 shadow-card">
              <div className="grid items-center gap-4.5 md:grid-cols-[44px_minmax(0,1fr)_140px_180px]">
                <div className="text-[12px] font-semibold text-mute">{String(i + 1).padStart(2, "0")}</div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-mute">
                    {ASSET_LABELS[h.info.asset_type]} · {h.info.simbolo}
                  </div>
                  <Link href={`/mercado/${h.info.mint}`} className="hover:text-acid">
                    <Display size="xs" as="h3" className="mt-1">
                      {h.info.nombre}
                    </Display>
                  </Link>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.16em] text-mute">Cuotapartes</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{formatInt(h.balance)}</div>
                </div>
                <div>
                  <div className="text-[10.5px] uppercase tracking-[0.16em] text-mute">Valor</div>
                  <div className="mt-1 text-[clamp(20px,4.5vw,26px)] font-medium tabular-nums">
                    {formatUsdcMoney(h.balance * (h.state?.navPerToken ?? 0n))}
                  </div>
                </div>
              </div>
              {h.rentas.length > 0 && (
                <div className="mt-4 flex flex-col gap-2">
                  {h.rentas.map((r) => (
                    <RentaRow
                      key={r.index}
                      renta={r}
                      mint={address(h.info.mint)}
                      owner={owner}
                      balance={h.balance}
                      onDone={reload}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

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
    <div className="flex flex-col gap-2 rounded-card bg-surface-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11.5px] tracking-[0.02em] text-mute">
          Distribución #{renta.index} · total {formatUsdc(renta.total)} · TC {renta.arsPerUsd}
        </span>
        {renta.paid !== null ? (
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-up">
            Cobraste {formatUsdc(renta.paid)} (≈ ARS {Math.round((Number(renta.paid) / 1e6) * renta.arsPerUsd).toLocaleString("es-AR")})
          </span>
        ) : !renta.closed && balance > 0n ? (
          <Button className="h-10 px-4 text-[11px]" onClick={reclamar} loading={busy}>
            Reclamar mi renta
          </Button>
        ) : (
          <span className="text-[11.5px] uppercase tracking-[0.12em] text-dim">Sin participación</span>
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-card bg-surface px-6 py-5 shadow-card">
      <div>
        <Kicker>Fondos de prueba · devnet</Kicker>
        <p className="mt-2 text-[12.5px] tracking-[0.02em] text-mute">
          1.000 USDC de prueba y SOL para las fees, para recorrer la demo.
        </p>
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
    </div>
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
    <div className="mb-6 flex flex-col gap-4 rounded-card bg-surface px-6 py-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Display size="sm" as="h3">
          Transferir certificados
        </Display>
        <LegalTag>CNV · oferta privada</LegalTag>
      </div>
      <p className="max-w-3xl text-[12.5px] leading-[1.7] tracking-[0.03em] text-mute">
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
          <Input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Dirección Solana" />
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
    </div>
  );
}
