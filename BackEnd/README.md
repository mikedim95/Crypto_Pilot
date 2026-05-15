# Horizon Trade Backend

Express + TypeScript backend for the Horizon Trade frontend.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Start the backend:

```bash
npm run dev
```

The API runs on `http://localhost:3001` by default.

## Endpoints

- `GET /health`
- `GET /api/health`
- `GET /ready`
- `GET /api/ready`
- `POST /api/auth/nonce`
- `POST /api/auth/verify`
- `GET /api/wallet/me`
- `POST /api/swap/quote`
- `POST /api/swap/manual`
- `GET /api/dashboard`
- `GET /api/orders`
- `GET /api/mining/overview`
- `GET /api/mining/nicehash`
- `GET /api/crypto-com/connection`
- `POST /api/crypto-com/connection`
- `DELETE /api/crypto-com/connection`
- `GET /api/crypto-com/overview`

## Notes

- Live account endpoints currently return empty responses while the app runs in public-data and demo-only mode.
- The new Wallet feature uses Phantom in the browser only. The backend only verifies signed messages, reads balances through RPC, and proxies Jupiter order/execute requests.
- For this repo's current deployment shape, Prisma is pointed at the existing MySQL database through `DATABASE_URL` so the Wallet feature can be added without introducing a second database.

### Pi To Vercel Miner Telemetry

The Pi backend remains the local poller for VNish/CGMiner data. If you also want the hosted `mytrader-next` app on Vercel to show the same ASIC fleet, configure these optional env vars:

- `MINER_INGEST_URL`
- `MINER_INGEST_TOKEN`
- `MINER_POLL_MS` (default/minimum: `60000`, one ASIC fleet poll per minute)
- `MINER_PUSH_SOURCE` (default: `pi`)
- `MINER_PUSH_TIMEOUT_MS` (default: `8000`)

When `MINER_INGEST_URL` and `MINER_INGEST_TOKEN` are present, every poll cycle still writes to the Pi's local MySQL database and also POSTs the latest fleet snapshot batch to the Vercel `/api/fleet/ingest` endpoint.

### Optional Mining/NiceHash env inputs

You can provide mining data from your own collector by setting these variables:

- `NICEHASH_API_KEY`
- `NICEHASH_API_SECRET`
- `NICEHASH_ORG_ID`
- `NICEHASH_API_HOST` (default: `https://api2.nicehash.com`)

For Crypto.com Exchange wallet visibility in the frontend Exchanges pane, you can also provide:

- `CRYPTO_COM_API_KEY`
- `CRYPTO_COM_API_SECRET`
- `CRYPTO_COM_API_HOST` (default: `https://api.crypto.com`)

For live rig data in the NiceHash tab, the NiceHash API key should include `VMDS` (view mining data) in addition to wallet read access.

- `MINERS_BASIC_JSON` (JSON array of miner objects)
- `MINING_TOTAL_MINERS`
- `MINING_ACTIVE_MINERS`
- `MINING_TOTAL_HASHRATE_TH`
- `MINING_TOTAL_POWER_W`
- `MINING_AVG_CHIP_TEMP_C`
- `MINING_EST_DAILY_REVENUE_USD`
- `NICEHASH_CONNECTED`
- `NICEHASH_POOL_STATUS`
- `NICEHASH_POOL_NAME`
- `NICEHASH_POOL_URL`
- `NICEHASH_ALGORITHM`
- `NICEHASH_ASSIGNED_MINERS`
- `NICEHASH_HASHRATE_TH`
- `NICEHASH_POWER_W`
- `NICEHASH_EST_DAILY_REVENUE_USD`
