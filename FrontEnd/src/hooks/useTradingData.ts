import { useQuery } from "@tanstack/react-query";
import { backendApi } from "@/lib/api";

export function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: backendApi.getDashboard,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useOrdersData() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: backendApi.getOrders,
    staleTime: 10_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export function useBinanceConnection() {
  return useQuery({
    queryKey: ["binance-connection"],
    queryFn: backendApi.getBinanceConnection,
    staleTime: 5_000,
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useMiningOverview() {
  return useQuery({
    queryKey: ["mining-overview"],
    queryFn: backendApi.getMiningOverview,
    staleTime: 10_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export function useNicehashOverview() {
  return useQuery({
    queryKey: ["nicehash-overview"],
    queryFn: backendApi.getNicehashOverview,
    staleTime: 10_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}
