import "dotenv/config";
import { Connection } from "@solana/web3.js";
import logger from "../logger.js";
import { loadTrackedBalances } from "./balance-utils.js";
import { getBotWalletStatus } from "./bot-wallet.js";

async function main(): Promise<void> {
  const rpcUrl = process.env.SOLANA_RPC_URL?.trim();
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required for the bot wallet balance check.");
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const status = await getBotWalletStatus(logger.child({ module: "bot-wallet-check" }), (address) =>
    loadTrackedBalances(connection, address)
  );

  if (!status.configured || !status.address || !status.balances) {
    throw new Error(status.note);
  }

  logger.info(
    {
      address: status.address,
      balances: status.balances,
    },
    "Bot wallet balance check complete."
  );
}

main().catch((error) => {
  logger.error({ error: error instanceof Error ? error.message : String(error) }, "Bot wallet balance check failed.");
  process.exit(1);
});
