export interface Asset {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  balance: number;
  value: number;
  allocation: number;
  targetAllocation: number;
  sparkline: number[];
}

export interface Order {
  id: string;
  time: string;
  pair: string;
  side: "Buy" | "Sell";
  price: number;
  amount: number;
  status: "Filled" | "Pending" | "Cancelled";
}

export interface Activity {
  id: string;
  type: string;
  asset: string;
  amount: string;
  time: string;
}

export interface PortfolioHistoryPoint {
  time: string;
  value: number;
}

export interface MarketMover {
  symbol: string;
  name: string;
  change: number;
}

export type ConnectionSource = "none" | "env" | "session";

export interface ConnectionStatus {
  connected: boolean;
  source: ConnectionSource;
  testnet: boolean;
  message?: string;
}

export interface DashboardResponse {
  connection: ConnectionStatus;
  assets: Asset[];
  totalPortfolioValue: number;
  portfolioChange24h: number;
  portfolioChange24hValue: number;
  portfolioHistory: PortfolioHistoryPoint[];
  marketMovers: MarketMover[];
  recentActivity: Activity[];
  generatedAt: string;
}

export interface OrdersResponse {
  connection: ConnectionStatus;
  orders: Order[];
}

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}
