import { DashboardResponse, OrdersResponse, ConnectionStatus, Asset, Order } from "./types.js";

const spark = (base: number, trend: number): number[] =>
  Array.from({ length: 24 }, (_, i) => {
    const linear = base + trend * (i / 24);
    const wave = Math.sin(i / 2.5) * base * 0.015;
    return Number((linear + wave).toFixed(6));
  });

const mockAssets: Asset[] = [
  {
    id: "btc",
    symbol: "BTC",
    name: "Bitcoin",
    price: 67432.18,
    change24h: 2.34,
    volume24h: 28_400_000_000,
    marketCap: 1_320_000_000_000,
    balance: 1.2453,
    value: 83_987.45,
    allocation: 42.1,
    targetAllocation: 40,
    sparkline: spark(67000, 1500),
  },
  {
    id: "eth",
    symbol: "ETH",
    name: "Ethereum",
    price: 3521.67,
    change24h: -1.12,
    volume24h: 15_200_000_000,
    marketCap: 423_000_000_000,
    balance: 12.847,
    value: 45_240.87,
    allocation: 22.7,
    targetAllocation: 25,
    sparkline: spark(3550, -40),
  },
  {
    id: "sol",
    symbol: "SOL",
    name: "Solana",
    price: 178.43,
    change24h: 5.67,
    volume24h: 3_800_000_000,
    marketCap: 78_000_000_000,
    balance: 156.32,
    value: 27_888.94,
    allocation: 14.0,
    targetAllocation: 15,
    sparkline: spark(170, 8),
  },
  {
    id: "bnb",
    symbol: "BNB",
    name: "BNB",
    price: 612.89,
    change24h: 0.89,
    volume24h: 1_900_000_000,
    marketCap: 94_000_000_000,
    balance: 23.41,
    value: 14_347.78,
    allocation: 7.2,
    targetAllocation: 8,
    sparkline: spark(610, 5),
  },
  {
    id: "ada",
    symbol: "ADA",
    name: "Cardano",
    price: 0.6234,
    change24h: -2.45,
    volume24h: 890_000_000,
    marketCap: 22_000_000_000,
    balance: 15420,
    value: 9_616.95,
    allocation: 4.8,
    targetAllocation: 5,
    sparkline: spark(0.64, -0.015),
  },
  {
    id: "usdt",
    symbol: "USDT",
    name: "Tether",
    price: 1.0001,
    change24h: 0.01,
    volume24h: 52_000_000_000,
    marketCap: 112_000_000_000,
    balance: 18342.56,
    value: 18_344.39,
    allocation: 9.2,
    targetAllocation: 7,
    sparkline: spark(1, 0),
  },
];

const mockOrders: Order[] = [
  { id: "1", time: "2026-03-10 14:32", pair: "BTC/USDT", side: "Buy", price: 67200, amount: 0.15, status: "Filled" },
  { id: "2", time: "2026-03-10 13:18", pair: "ETH/USDT", side: "Sell", price: 3540, amount: 2.5, status: "Filled" },
  { id: "3", time: "2026-03-10 12:05", pair: "SOL/USDT", side: "Buy", price: 175.2, amount: 10, status: "Pending" },
  { id: "4", time: "2026-03-10 10:44", pair: "BNB/USDT", side: "Buy", price: 608, amount: 3, status: "Filled" },
  { id: "5", time: "2026-03-09 22:15", pair: "ADA/USDT", side: "Sell", price: 0.635, amount: 5000, status: "Cancelled" },
];

export function createFallbackDashboard(connection: ConnectionStatus): DashboardResponse {
  const totalPortfolioValue = mockAssets.reduce((sum, asset) => sum + asset.value, 0);
  const portfolioChange24hValue = 3672.14;
  const portfolioChange24h = 1.87;

  const portfolioHistory = Array.from({ length: 30 }, (_, i) => ({
    time: `Mar ${i + 1}`,
    value: Number((185_000 + i * 550 + Math.sin(i / 1.8) * 1200).toFixed(2)),
  }));

  const marketMovers = [...mockAssets]
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, 5)
    .map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      change: asset.change24h,
    }));

  const recentActivity = [
    { id: "1", type: "Buy", asset: "BTC", amount: "+0.15 BTC", time: "2 hours ago" },
    { id: "2", type: "Sell", asset: "ETH", amount: "-2.5 ETH", time: "3 hours ago" },
    { id: "3", type: "Deposit", asset: "USDT", amount: "+5,000 USDT", time: "5 hours ago" },
    { id: "4", type: "Buy", asset: "SOL", amount: "+10 SOL", time: "6 hours ago" },
  ];

  return {
    connection,
    assets: mockAssets,
    totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
    portfolioChange24h,
    portfolioChange24hValue,
    portfolioHistory,
    marketMovers,
    recentActivity,
    generatedAt: new Date().toISOString(),
  };
}

export function createFallbackOrders(connection: ConnectionStatus): OrdersResponse {
  return {
    connection,
    orders: mockOrders,
  };
}
