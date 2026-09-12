"use client";

import { fetchMint } from "@solana-program/token-2022";
import { address, isSome } from "@solana/kit";
import { use, useState } from "react";

import { useFideTok } from "@/components/providers";
import { Badge, Card, Field, Input, LegalTag, Notice, PageHeader } from "@/components/ui";
import { explorer, HOOK_PROGRAM } from "@/lib/config";
import { toHex } from "@/lib/format";
import { useLoader } from "@/lib/hooks";
import { fetchFideicomisoState } from "@/lib/solana/onchain";
import { sha256Hex } from "@/lib/upload";

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
        title="Verificar contrato"
        subtitle="Compará un PDF con el hash grabado en el token. Si coincide, es exactamente el contrato de fideicomiso que respalda los certificados."
        action={<LegalTag>CCyC</LegalTag>}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      {!data && !error && <div className="h-64 animate-pulse rounded-2xl bg-white/5" />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">
                {data.name} <span className="font-mono text-xs text-slate-500">{data.symbol}</span>
              </h3>
              <a className="text-xs text-emerald-300 hover:underline" href={explorer.address(mint)} target="_blank" rel="noreferrer">
                Explorer ↗
              </a>
            </div>
            <p className="text-xs text-slate-500">Metadata leída directamente del mint Token-2022:</p>
            <dl className="flex flex-col gap-2 text-sm">
              {data.fields.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-slate-500">{key}</dt>
                  <dd className="break-all font-mono text-xs text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Transfer hook:</span>
              {data.hookProgram === HOOK_PROGRAM ? <Badge tone="success">fidetok_hook (KYC obligatorio)</Badge> : <Badge tone="danger">no configurado</Badge>}
            </div>
          </Card>
          <Card className="flex flex-col gap-4">
            <Field label="Contrato a verificar (PDF)">
              <Input
                type="file"
                accept="application/pdf"
                className="pt-2"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !data.contractHash) return setCheck(null);
                  const hash = await sha256Hex(file);
                  setCheck({ hash, ok: hash === data.contractHash });
                }}
              />
            </Field>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500">Hash on-chain</span>
              <span className="break-all font-mono text-slate-300">{data.contractHash ?? "—"}</span>
            </div>
            {check && (
              <>
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-500">Hash del archivo</span>
                  <span className="break-all font-mono text-slate-300">{check.hash}</span>
                </div>
                <Notice tone={check.ok ? "success" : "danger"}>
                  {check.ok
                    ? "Coincide: este es el contrato firmado que respalda al token."
                    : "No coincide: este archivo no es el contrato registrado on-chain."}
                </Notice>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
