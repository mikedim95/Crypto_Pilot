# Bot Wallet

The bot wallet is separate from Phantom.

- Keep `BOT_SECRET_KEY_BASE58` only on the Raspberry Pi.
- Do not copy your Phantom seed phrase or Phantom private key onto the Pi.
- Use `npm run wallet:bot-check` from `BackEnd/` to confirm the Pi bot wallet can read SOL and USDC balances through your configured RPC.
