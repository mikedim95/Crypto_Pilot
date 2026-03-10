import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBinanceConnection } from "@/hooks/useTradingData";
import { backendApi } from "@/lib/api";

const otherExchanges = ["Coinbase", "Kraken"];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: connection } = useBinanceConnection();

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [testnet, setTestnet] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["binance-connection"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
    ]);
  };

  const connectMutation = useMutation({
    mutationFn: async () => {
      const result = await backendApi.connectBinance({
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        testnet,
      });
      return result;
    },
    onSuccess: async (next) => {
      setApiSecret("");
      setMessage(next.connected ? "Binance connected." : next.message ?? "Connection failed.");
      await refreshData();
    },
    onError: (error) => {
      setMessage(getErrorMessage(error));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: backendApi.disconnectBinance,
    onSuccess: async (next) => {
      setMessage(next.connected ? "Session disconnected. Environment credentials are still active." : "Disconnected.");
      await refreshData();
    },
    onError: (error) => {
      setMessage(getErrorMessage(error));
    },
  });

  const isBusy = connectMutation.isPending || disconnectMutation.isPending;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-mono font-semibold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage exchange connections and preferences.</p>
      </div>

      <div className="space-y-4 max-w-2xl">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Exchange Connections</div>

        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono font-semibold text-foreground">Binance</span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${connection.connected ? "bg-positive/10 text-positive" : "bg-secondary text-muted-foreground"}`}>
              {connection.connected ? "Connected" : "Disconnected"}
            </span>
          </div>

          <div className="text-[11px] text-muted-foreground">
            Source: {connection.source.toUpperCase()} {connection.testnet ? "(Testnet)" : "(Mainnet)"}
          </div>

          {connection.message ? (
            <div className="text-[11px] text-muted-foreground">{connection.message}</div>
          ) : null}

          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">API Key</label>
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className="mt-1 w-full bg-secondary rounded-md px-3 py-2.5 font-mono text-sm text-foreground outline-none border border-border focus:border-primary transition-colors"
                placeholder="Enter Binance API key..."
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">API Secret</label>
              <input
                type="password"
                value={apiSecret}
                onChange={(event) => setApiSecret(event.target.value)}
                className="mt-1 w-full bg-secondary rounded-md px-3 py-2.5 font-mono text-sm text-foreground outline-none border border-border focus:border-primary transition-colors"
                placeholder="Enter Binance API secret..."
                autoComplete="off"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={testnet}
                onChange={(event) => setTestnet(event.target.checked)}
                className="h-3.5 w-3.5"
              />
              Use Binance testnet
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => connectMutation.mutate()}
              disabled={isBusy || !apiKey.trim() || !apiSecret.trim()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-mono font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {connectMutation.isPending ? "Connecting..." : "Connect"}
            </button>
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={isBusy}
              className="px-4 py-2 rounded-md border border-border text-xs font-mono text-foreground hover:bg-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>

          {message ? <div className="text-[11px] text-muted-foreground">{message}</div> : null}
        </div>

        {otherExchanges.map((exchange) => (
          <div key={exchange} className="bg-card border border-border rounded-lg p-5 flex items-center justify-between">
            <span className="text-sm font-mono text-foreground">{exchange}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground">Coming soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}
