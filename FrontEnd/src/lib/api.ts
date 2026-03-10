import type {
  ConnectionStatus,
  DashboardResponse,
  MiningOverviewResponse,
  NicehashOverviewResponse,
  OrdersResponse,
} from "@/types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

interface ConnectRequest {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

function parseJsonSafely(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const bodyText = await response.text();
  const payload = parseJsonSafely(bodyText);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof (payload as { message: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}

export const backendApi = {
  getDashboard: () => apiRequest<DashboardResponse>("/api/dashboard"),
  getOrders: () => apiRequest<OrdersResponse>("/api/orders"),
  getMiningOverview: () => apiRequest<MiningOverviewResponse>("/api/mining/overview"),
  getNicehashOverview: () => apiRequest<NicehashOverviewResponse>("/api/mining/nicehash"),
  getBinanceConnection: () => apiRequest<ConnectionStatus>("/api/binance/connection"),
  connectBinance: (body: ConnectRequest) =>
    apiRequest<ConnectionStatus>("/api/binance/connection", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  disconnectBinance: () =>
    apiRequest<ConnectionStatus>("/api/binance/connection", {
      method: "DELETE",
    }),
};
