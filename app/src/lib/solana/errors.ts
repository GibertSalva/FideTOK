/** Traduce errores de wallet / RPC / programas a un mensaje legible para la UI. */
export function describeError(error: unknown): string {
  const text = collectText(error);
  const anchor = text.match(/Error Message: ([^\n"\\]+?)\.?(?:\\n|\n|"|$)/);
  if (anchor) return anchor[1];
  if (/user rejected|rejected the request|declined/i.test(text)) return "Cancelaste la firma en la wallet.";
  if (/insufficient (funds|lamports)|debit an account but found no record/i.test(text)) {
    return "Saldo insuficiente (SOL para fees o USDC).";
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function collectText(error: unknown, depth = 0): string {
  if (depth > 4 || error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const context = (error as Error & { context?: unknown }).context;
    return [error.message, safeJson(context), collectText(error.cause, depth + 1)].join("\n");
  }
  return safeJson(error);
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "";
  } catch {
    return "";
  }
}
