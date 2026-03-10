import { DashboardResponse, OrdersResponse, ConnectionStatus } from "./types.js";

export function createFallbackDashboard(connection: ConnectionStatus): DashboardResponse {
  return {
    connection,
    assets: [],
    totalPortfolioValue: 0,
    portfolioChange24h: 0,
    portfolioChange24hValue: 0,
    portfolioHistory: [],
    marketMovers: [],
    recentActivity: [],
    generatedAt: new Date().toISOString(),
  };
}

export function createFallbackOrders(connection: ConnectionStatus): OrdersResponse {
  return {
    connection,
    orders: [],
  };
}
