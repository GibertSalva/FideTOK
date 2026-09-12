import { fidetok } from "@fidetok/client";
import { getAddressEncoder, getProgramDerivedAddress, getU32Encoder, type Address } from "@solana/kit";

/** PDA de una distribucion: ["distribution", fideicomiso, index u32 LE]. */
export async function findDistributionPda(fideicomiso: Address, index: number) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: fidetok.FIDETOK_PROGRAM_ADDRESS,
    seeds: ["distribution", getAddressEncoder().encode(fideicomiso), getU32Encoder().encode(index)],
  });
  return pda;
}
