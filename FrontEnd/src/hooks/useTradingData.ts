import { useQuery } from "@tanstack/react-query";
import {
  assets,
  marketMovers,
  orders,
  portfolioChange24h,
  portfolioChange24hValue,
  portfolioHistory,
  recentActivity,
  totalPortfolioValue,
} from "@/data/mockData";
import { backendApi } from "@/lib/api";
import type { ConnectionStatus, DashboardResponse, OrdersResponse } from "@/types/api";

const fallbackConnection: ConnectionStatus = {
  connected: false,
  source: "none",
  testnet: false,
  message: "Demo mode. Connect Binance in Settings for live account data.",
};

const fallbackDashboard: DashboardResponse = {
  connection: fallbackConnection,
  assets,
  totalPortfolioValue,
  portfolioChange24h,
  portfolioChange24hValue,
  portfolioHistory,
  marketMovers,
  recentActivity,
  generatedAt: new Date().toISOString(),
};

const fallbackOrders: OrdersResponse = {
  connection: fallbackConnection,
  orders,
};

export function useDashboardData() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: backendApi.getDashboard,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });

  return {
    ...query,
    data: query.data ?? fallbackDashboard,
  };
}

export function useOrdersData() {
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: backendApi.getOrders,
    staleTime: 10_000,
    refetchInterval: 20_000,
    retry: 1,
  });

  return {
    ...query,
    data: query.data ?? fallbackOrders,
  };
}

export function useBinanceConnection() {
  const query = useQuery({
    queryKey: ["binance-connection"],
    queryFn: backendApi.getBinanceConnection,
    staleTime: 5_000,
    refetchInterval: 15_000,
    retry: false,
  });

  return {
    ...query,
    data: query.data ?? fallbackConnection,
  };
}
