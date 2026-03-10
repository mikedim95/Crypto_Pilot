# Horizon Trade Backend

Express + TypeScript backend for the Horizon Trade frontend, with Binance integration.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Add Binance credentials (or use the frontend Settings page to provide session credentials):

```env
BINANCE_API_KEY=your_key
BINANCE_API_SECRET=your_secret
BINANCE_TESTNET=false
```

4. Start the backend:

```bash
npm run dev
```

The API runs on `http://localhost:3001` by default.

## Endpoints

- `GET /api/health`
- `GET /api/binance/connection`
- `POST /api/binance/connection`
- `DELETE /api/binance/connection`
- `GET /api/dashboard`
- `GET /api/orders`

## Notes

- If Binance credentials are unavailable or invalid, the API returns demo fallback data so the frontend remains usable.
- Session credentials sent through `POST /api/binance/connection` are kept in memory only (not persisted to disk).
