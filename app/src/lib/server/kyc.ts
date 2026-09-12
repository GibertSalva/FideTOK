import { createHash, randomBytes } from "node:crypto";

export type RiskFlag = { code: string; severity: "alta" | "media" | "info"; message: string };

// Simulacion de padrones de riesgo (RePET / UIF / PEP) para la demo. En produccion: API del proveedor KYC.
const LISTA_RIESGO: Record<string, string> = {
  "11111111": "Coincidencia en RePET (Registro Publico de Personas vinculadas a actos de Terrorismo)",
  "22222222": "Persona Expuesta Politicamente (PEP): requiere debida diligencia reforzada",
};

export function isValidCuit(cuit: string) {
  const digits = cuit.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, weight, i) => acc + weight * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

export function evaluateRisk(input: {
  dni: string;
  cuit: string;
  residenteAr: boolean;
  origenFondos: string;
}): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const dni = input.dni.replace(/\D/g, "");
  if (!/^\d{7,8}$/.test(dni)) flags.push({ code: "dni_invalido", severity: "alta", message: "El DNI no tiene 7 u 8 digitos" });
  if (!isValidCuit(input.cuit)) flags.push({ code: "cuit_invalido", severity: "alta", message: "El digito verificador del CUIT/CUIL no coincide" });
  else if (!input.cuit.replace(/\D/g, "").includes(dni)) {
    flags.push({ code: "cuit_dni", severity: "media", message: "El CUIT/CUIL no contiene el DNI informado" });
  }
  const lista = LISTA_RIESGO[dni];
  if (lista) flags.push({ code: "lista_riesgo", severity: "alta", message: lista });
  if (!input.residenteAr) {
    flags.push({ code: "extranjero", severity: "info", message: "No residente: no puede invertir en activos rurales (Ley 26.737)" });
  }
  if (input.origenFondos === "otros") {
    flags.push({ code: "origen_fondos", severity: "media", message: "Origen de fondos 'otros': pedir documentacion respaldatoria" });
  }
  return flags;
}

/** Commitment que va on-chain: sha256(dni|cuit|nonce). El nonce secreto evita revertirlo por diccionario. */
export function makeCommitment(dni: string, cuit: string) {
  const nonce = randomBytes(32).toString("hex");
  const commitment = createHash("sha256").update(`${dni}|${cuit}|${nonce}`).digest("hex");
  return { nonce, commitment };
}
