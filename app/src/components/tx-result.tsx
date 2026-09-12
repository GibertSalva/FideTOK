import { Notice } from "@/components/ui";
import { explorer } from "@/lib/config";

export type TxState = { kind: "ok"; message: string; signature?: string } | { kind: "error"; message: string } | null;

export function TxResult({ state }: { state: TxState }) {
  if (!state) return null;
  if (state.kind === "error") return <Notice tone="danger">{state.message}</Notice>;
  return (
    <Notice tone="success">
      {state.message}{" "}
      {state.signature && (
        <a className="font-semibold underline" href={explorer.tx(state.signature)} target="_blank" rel="noreferrer">
          Ver en el Explorer
        </a>
      )}
    </Notice>
  );
}
