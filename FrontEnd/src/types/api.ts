import type { Activity, Asset, Order } from "@/data/mockData";

export interface ConnectionStatus {
  connected: boolean;
  source: "none" | "env" | "session";
  testnet: boolean;
  message?: string;
}

export interface DashboardResponse {
  connection: ConnectionStatus;
  assets: Asset[];
  totalPortfolioValue: number;
  portfolioChange24h: number;
  portfolioChange24hValue: number;
  portfolioHistory: { time: string; value: number }[];
  marketMovers: { symbol: string; name: string; change: number }[];
  recentActivity: Activity[];
  generatedAt: string;
}

export interface OrdersResponse {
  connection: ConnectionStatus;
  orders: Order[];
}
