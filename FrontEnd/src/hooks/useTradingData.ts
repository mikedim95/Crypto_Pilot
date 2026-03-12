import { useQuery } from "@tanstack/react-query";
import { backendApi } from "@/lib/api";
import type { PortfolioAccountType } from "@/types/api";

export function useDashboardData(accountType: PortfolioAccountType = "real") {
  return useQuery({
    queryKey: ["dashboard", accountType],
    queryFn: () => backendApi.getDashboard(accountType),
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

export function useDemoAccountSettings() {
  return useQuery({
    queryKey: ["demo-account-settings"],
    queryFn: backendApi.getDemoAccountSettings,
    staleTime: 5_000,
    refetchInterval: 20_000,
    retry: 1,
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

export function useStrategies() {
  return useQuery({
    queryKey: ["strategies"],
    queryFn: backendApi.getStrategies,
    staleTime: 5_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export function useStrategyRuns(accountType: PortfolioAccountType = "real") {
  return useQuery({
    queryKey: ["strategy-runs", accountType],
    queryFn: () => backendApi.getStrategyRuns(accountType),
    staleTime: 5_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export function useStrategyRunDetails(runId: string | undefined) {
  return useQuery({
    queryKey: ["strategy-run", runId],
    queryFn: () => backendApi.getStrategyRun(runId ?? ""),
    enabled: Boolean(runId),
    staleTime: 5_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export function useBacktests() {
  return useQuery({
    queryKey: ["backtests"],
    queryFn: backendApi.getBacktests,
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useStrategyState(strategyId: string | undefined, accountType: PortfolioAccountType = "real") {
  return useQuery({
    queryKey: ["strategy-state", strategyId, accountType],
    queryFn: () => backendApi.getStrategyState(strategyId ?? "", accountType),
    enabled: Boolean(strategyId),
    staleTime: 5_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export function useStrategyExecutionPlan(strategyId: string | undefined, accountType: PortfolioAccountType = "real") {
  return useQuery({
    queryKey: ["strategy-execution-plan", strategyId, accountType],
    queryFn: () => backendApi.getStrategyExecutionPlan(strategyId ?? "", accountType),
    enabled: Boolean(strategyId),
    staleTime: 5_000,
    refetchInterval: 20_000,
    retry: 1,
  });
}

export function useBacktestMetrics(backtestId: string | undefined) {
  return useQuery({
    queryKey: ["backtest-metrics", backtestId],
    queryFn: () => backendApi.getBacktestMetrics(backtestId ?? ""),
    enabled: Boolean(backtestId),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useBacktestTimeline(backtestId: string | undefined) {
  return useQuery({
    queryKey: ["backtest-timeline", backtestId],
    queryFn: () => backendApi.getBacktestTimeline(backtestId ?? ""),
    enabled: Boolean(backtestId),
    staleTime: 10_000,
    retry: 1,
  });
}
