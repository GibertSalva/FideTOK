"use client";

import { fetchMint } from "@solana-program/token-2022";
import { address, isSome } from "@solana/kit";
import { use, useState } from "react";

import { useFideTok } from "@/components/providers";
import { Badge, cn, DataRow, Display, Field, Input, Kicker, LegalTag, Notice, PageHeader, Section } from "@/components/ui";
import { explorer, HOOK_PROGRAM } from "@/lib/config";
import { toHex } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { fetchFideicomisoState } from "@/lib/solana/onchain";
import { sha256Hex } from "@/lib/upload";

const FILE_INPUT =
  "py-2 text-[11px] uppercase tracking-[0.12em] text-mute file:mr-3 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3.5 file:py-2 file:text-[11px] file:uppercase file:tracking-[0.12em] file:text-mute hover:file:bg-surface-3 hover:file:text-acid";

/** Pagina publica: cualquiera puede comprobar que un contrato es el que respalda al token. */
export default function VerificarPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint: mintParam } = use(params);
  const mint = address(mintParam);
  const client = useFideTok();
  const [check, setCheck] = useState<{ hash: string; ok: boolean } | null>(null);

  const { data, error } = useLoader(async () => {
    const [account, state] = await Promise.all([fetchMint(client.rpc, mint), fetchFideicomisoState(client.rpc, mint)]);
    const extensions = isSome(account.data.extensions) ? account.data.extensions.value : [];
    const metadata = extensions.find((e) => e.__kind === "TokenMetadata");
    const hook = extensions.find((e) => e.__kind === "TransferHook");
    return {
      name: metadata && "name" in metadata ? metadata.name : "",
      symbol: metadata && "symbol" in metadata ? metadata.symbol : "",
      fields: metadata && "additionalMetadata" in metadata ? Array.from(metadata.additionalMetadata.entries()) : [],
      hookProgram: hook && "programId" in hook ? hook.programId : null,
      contractHash: state ? toHex(Uint8Array.from(state.contractSha256)) : null,
    };
  }, [client, mint]);

  return (
    <>
      <PageHeader
        kicker="Auditoría pública"
        title="Verificar contrato"
        subtitle="Contrastá un PDF contra el hash grabado en el token. Sin sesión ni permiso."
        action={<LegalTag>CCyC</LegalTag>}
      />
      {error && (
        <Section>
          <Notice tone="danger">{error}</Notice>
        </Section>
      )}
      {!data && !error && <div className="my-8 h-64 animate-pulse rounded-card bg-surface" />}
      {data && (
        <div className="grid gap-3 pb-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-card bg-surface px-6 py-6 shadow-card">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Kicker>Mint Token-2022</Kicker>
                <Display size="sm" as="h3" className="mt-2">
                  {data.name}
                </Display>
                <div className="mt-1 text-[11.5px] uppercase tracking-[0.18em] text-mute">{data.symbol}</div>
              </div>
              <a
                className="text-[12px] uppercase tracking-[0.16em] text-acid hover:underline"
                href={explorer.address(mint)}
                target="_blank"
                rel="noreferrer"
              >
                Explorer ↗
              </a>
            </div>
            <div>
              {data.fields.map(([key, value]) => (
                <DataRow
                  key={key}
                  k={key}
                  v={<span className="break-all text-[11px] tracking-normal">{value}</span>}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Kicker>Transfer hook</Kicker>
              {data.hookProgram === HOOK_PROGRAM ? (
                <Badge tone="success">fidetok_hook · KYC obligatorio</Badge>
              ) : (
                <Badge tone="danger">No configurado</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-5 rounded-card bg-surface px-6 py-6 shadow-card">
            <Field label="Contrato a verificar (PDF)">
              <Input
                type="file"
                accept="application/pdf"
                className={FILE_INPUT}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !data.contractHash) return setCheck(null);
                  const hash = await sha256Hex(file);
                  setCheck({ hash, ok: hash === data.contractHash });
                }}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <Kicker>Hash on-chain</Kicker>
              <span className="break-all text-[11px] tracking-[0.04em] text-bone">{data.contractHash ?? "—"}</span>
            </div>
            {check && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Kicker>Hash del archivo</Kicker>
                  <span className="break-all text-[11px] tracking-[0.04em] text-bone">{check.hash}</span>
                </div>
                <div className={cn("rounded-card px-5 py-4 shadow-card", check.ok ? "bg-acid text-ink" : "bg-down/15 text-down")}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em]">
                    {check.ok ? "Coincide" : "No coincide"}
                  </div>
                  <div className="mt-2 font-display text-[24px] leading-[1.15] uppercase">
                    {check.ok
                      ? "Es el contrato firmado que respalda al token"
                      : "Este archivo no es el contrato registrado on-chain"}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
