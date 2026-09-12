import { createFideTokClient } from "./client.js";

async function main() {
  const client = await createFideTokClient();
  const { value: balance } = await client.rpc.getBalance(client.payer.address).send();
  console.log(`Wallet: ${client.payer.address}`);
  console.log(`Balance: ${balance} lamports`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
