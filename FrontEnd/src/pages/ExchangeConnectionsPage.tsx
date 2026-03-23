import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Coins, KeyRound, Landmark, Link2, ShieldCheck, Wallet, WifiOff } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCryptoComConnection, useCryptoComOverview, useExchangeHealth } from "@/hooks/useTradingData";
import { backendApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ExchangeHealth, ExchangeId } from "@/types/api";

const EXCHANGE_ORDER: ExchangeId[] = ["kraken", "coinbase", "crypto.com"];

function formatExchangeLabel(exchange: ExchangeId): string {
  return exchange === "crypto.com"
    ? "Crypto.com"
    : exchange.charAt(0).toUpperCase() + exchange.slice(1);
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatToken(value: number | null | undefined, symbol: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return `-- ${symbol}`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${symbol}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function statusBadge(online: boolean): string {
  return online
    ? "border-positive/30 bg-positive/10 text-positive"
    : "border-negative/30 bg-negative/10 text-negative";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleTimeString();
}

function PublicExchangeCard({ exchange, health }: { exchange: ExchangeId; health?: ExchangeHealth }) {
  const online = health?.status === "online";

  return (
    <Card className="animate-fade-up">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Public Venue</div>
          <div className="mt-2 text-lg font-mono font-semibold text-foreground">{formatExchangeLabel(exchange)}</div>
        </div>
        {online ? <Activity className="h-4 w-4 text-positive" /> : <WifiOff className="h-4 w-4 text-negative" />}
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider",
            statusBadge(online)
          )}
        >
          {online ? "Public feed online" : "Public feed offline"}
        </div>
        <div className="text-sm text-muted-foreground">
          Market data is available in the Market Intel tab for this venue.
        </div>
        <div className="text-xs text-muted-foreground">
          Updated <span className="font-mono text-foreground">{formatTimestamp(health?.timestamp)}</span>
        </div>
        {health?.message ? <div className="text-xs text-muted-foreground">{health.message}</div> : null}
      </CardContent>
    </Card>
  );
}

function SummaryMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/15 p-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-mono font-semibold text-foreground">{value}</div>
      {helper ? <div className="mt-2 text-xs text-muted-foreground">{helper}</div> : null}
    </div>
  );
}

export function ExchangeConnectionsPage() {
  const queryClient = useQueryClient();
  const { data: healthData, isPending: loadingHealth } = useExchangeHealth();
  const { data: cryptoComConnection } = useCryptoComConnection();
  const { data: cryptoComOverview } = useCryptoComOverview(cryptoComConnection?.connected ?? false);

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [apiHost, setApiHost] = useState("https://api.crypto.com");
  const [cryptoComMessage, setCryptoComMessage] = useState<string | null>(null);
  const [cryptoComSections, setCryptoComSections] = useState<string[]>([]);

  const healthByExchange = useMemo(
    () => new Map((healthData?.exchanges ?? []).map((entry) => [entry.exchange, entry])),
    [healthData?.exchanges]
  );
  const publicOnlineCount = (healthData?.exchanges ?? []).filter((exchange) => exchange.status === "online").length;
  const privateConnectedCount = cryptoComConnection?.connected ? 1 : 0;
  const cryptoComConnected = cryptoComConnection?.connected ?? false;
  const cryptoComSource = cryptoComConnection?.source?.toUpperCase() ?? "NONE";
  const cryptoComGeneratedAt = formatTimestamp(cryptoComOverview?.generatedAt);
  const topBalances = cryptoComOverview?.assets.slice(0, 8) ?? [];

  useEffect(() => {
    if (!cryptoComConnection?.message) return;
    setCryptoComMessage(cryptoComConnection.message);
  }, [cryptoComConnection?.message]);

  const refreshCryptoComData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["crypto-com-connection"] }),
      queryClient.invalidateQueries({ queryKey: ["crypto-com-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["exchange-health"] }),
    ]);
  };

  const connectCryptoComMutation = useMutation({
    mutationFn: async () =>
      backendApi.connectCryptoCom({
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        apiHost: apiHost.trim(),
      }),
    onSuccess: async (next) => {
      setApiKey("");
      setApiSecret("");
      setCryptoComSections(next.connected ? ["details"] : ["setup"]);
      setCryptoComMessage(next.connected ? "Crypto.com credentials saved for this user." : next.message ?? "Connection failed.");
      await refreshCryptoComData();
    },
    onError: (error) => {
      setCryptoComSections(["setup"]);
      setCryptoComMessage(getErrorMessage(error));
    },
  });

  const disconnectCryptoComMutation = useMutation({
    mutationFn: backendApi.disconnectCryptoCom,
    onSuccess: async (next) => {
      setApiKey("");
      setApiSecret("");
      setCryptoComSections(["setup"]);
      setCryptoComMessage(
        next.connected ? "Stored credentials removed. Environment credentials are still active." : "Stored Crypto.com credentials removed."
      );
      await refreshCryptoComData();
    },
    onError: (error) => {
      setCryptoComMessage(getErrorMessage(error));
    },
  });

  const isCryptoComBusy = connectCryptoComMutation.isPending || disconnectCryptoComMutation.isPending;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="animate-fade-up">
          <CardHeader className="pb-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Venues</div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-mono font-semibold text-foreground">{EXCHANGE_ORDER.length}</div>
            <div className="text-sm text-muted-foreground">Kraken, Coinbase, and Crypto.com visible in one place.</div>
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
          <CardHeader className="pb-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Private Links</div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-mono font-semibold text-foreground">{privateConnectedCount}</div>
            <div className="text-sm text-muted-foreground">Authenticated exchange connections active right now.</div>
          </CardContent>
        </Card>

        <Card className="animate-fade-up" style={{ animationDelay: "140ms" }}>
          <CardHeader className="pb-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Public Feeds</div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-mono font-semibold text-foreground">
              {loadingHealth ? "--" : `${publicOnlineCount}/${EXCHANGE_ORDER.length}`}
            </div>
            <div className="text-sm text-muted-foreground">Live public market adapters reporting healthy status.</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="animate-fade-up">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Private Connection</div>
                <div className="mt-2 text-xl font-mono font-semibold text-foreground">Crypto.com</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Add a read-enabled Crypto.com Exchange API key to unlock wallet visibility inside this app.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider",
                    statusBadge(cryptoComConnection?.connected ?? false)
                  )}
                >
                  {cryptoComConnection?.connected ? "Connected" : "Disconnected"}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-secondary/20 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  Source {cryptoComConnection?.source?.toUpperCase() ?? "NONE"}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-xl border border-border bg-secondary/15 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  Use a Crypto.com Exchange key with read permissions. If the key is IP-whitelisted, allow the backend server's public
                  egress IP, not the local browser or Tailscale address.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Connection Summary</div>
                  <div className="mt-2 text-lg font-mono font-semibold text-foreground">
                    {cryptoComConnected ? "Authenticated" : "Needs setup"}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {cryptoComConnected
                      ? "Stored Crypto.com credentials are active. Expand a section below to inspect balances or rotate the key."
                      : "Keep this pane collapsed until you need it. Expand setup to paste a read-only Exchange API key."}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {cryptoComConnected ? (
                    <>
                      <Button type="button" variant="outline" onClick={() => setCryptoComSections(["wallet"])}>
                        <Wallet className="h-4 w-4" />
                        View balances
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => disconnectCryptoComMutation.mutate()}
                        disabled={isCryptoComBusy}
                      >
                        <KeyRound className="h-4 w-4" />
                        {disconnectCryptoComMutation.isPending ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setCryptoComSections(["setup"])}>
                      <Link2 className="h-4 w-4" />
                      Add API key
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {cryptoComConnected ? (
                  <>
                    <SummaryMetric label="Available" value={formatUsd(cryptoComOverview?.totalAvailableBalanceUsd)} />
                    <SummaryMetric label="Assets" value={cryptoComOverview?.assets.length ?? 0} />
                    <SummaryMetric label="Source" value={cryptoComSource} />
                    <SummaryMetric label="Synced" value={cryptoComGeneratedAt} helper="Last wallet refresh" />
                  </>
                ) : (
                  <>
                    <SummaryMetric label="Status" value="Disconnected" />
                    <SummaryMetric label="Source" value={cryptoComSource} />
                    <SummaryMetric label="API Host" value={apiHost} helper="Default production Exchange host" />
                    <SummaryMetric label="Access" value="Read only" helper="Only Can Read is needed" />
                  </>
                )}
              </div>
            </div>

            {cryptoComMessage ? (
              <div className="rounded-lg border border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                {cryptoComMessage}
              </div>
            ) : null}

            <Accordion type="multiple" value={cryptoComSections} onValueChange={setCryptoComSections} className="rounded-2xl border border-border bg-background/30 px-4">
              <AccordionItem value="setup" className="border-border">
                <AccordionTrigger className="py-5 text-left hover:no-underline">
                  <div>
                    <div className="text-sm font-mono font-semibold text-foreground">
                      {cryptoComConnected ? "Update credentials" : "Setup API credentials"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {cryptoComConnected
                        ? "Rotate the stored key only when you need to replace it."
                        : "Paste a read-enabled Exchange API key only when you are ready to connect."}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  {cryptoComConnected ? (
                    <div className="mb-4 rounded-lg border border-border bg-secondary/15 px-4 py-3 text-sm text-muted-foreground">
                      Saving a new API key will replace the currently stored credentials for this user.
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">API Key</label>
                      <Input
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        className="mt-1 border-border bg-secondary/10 font-mono"
                        placeholder="Paste Crypto.com API key"
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">API Host</label>
                      <Input
                        value={apiHost}
                        onChange={(event) => setApiHost(event.target.value)}
                        className="mt-1 border-border bg-secondary/10 font-mono"
                        placeholder="https://api.crypto.com"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Secret Key</label>
                    <Input
                      type="password"
                      value={apiSecret}
                      onChange={(event) => setApiSecret(event.target.value)}
                      className="mt-1 border-border bg-secondary/10 font-mono"
                      placeholder="Paste Crypto.com secret key"
                      autoComplete="off"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={() => connectCryptoComMutation.mutate()}
                      disabled={isCryptoComBusy || !apiKey.trim() || !apiSecret.trim()}
                      className="bg-primary text-primary-foreground"
                    >
                      <Link2 className="h-4 w-4" />
                      {connectCryptoComMutation.isPending ? "Connecting..." : cryptoComConnected ? "Replace credentials" : "Connect Crypto.com"}
                    </Button>
                    {cryptoComConnected ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => disconnectCryptoComMutation.mutate()}
                        disabled={isCryptoComBusy}
                      >
                        <KeyRound className="h-4 w-4" />
                        {disconnectCryptoComMutation.isPending ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {cryptoComConnected ? (
                <AccordionItem value="details" className="border-border">
                  <AccordionTrigger className="py-5 text-left hover:no-underline">
                    <div>
                      <div className="text-sm font-mono font-semibold text-foreground">Authenticated details</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Inspect the active connection state without exposing the stored credentials.
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <SummaryMetric label="Source" value={cryptoComSource} helper="Where the active credentials came from" />
                      <SummaryMetric label="API Host" value={apiHost} helper="Current Exchange REST target" />
                      <SummaryMetric label="Wallet sync" value={cryptoComGeneratedAt} helper="Latest overview response timestamp" />
                      <SummaryMetric label="Visibility" value={topBalances.length > 0 ? "Balances returned" : "No non-zero assets"} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ) : null}

              {cryptoComConnected ? (
                <AccordionItem value="wallet" className="border-border last:border-b-0">
                  <AccordionTrigger className="py-5 text-left hover:no-underline">
                    <div>
                      <div className="text-sm font-mono font-semibold text-foreground">Wallet snapshot</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Expand for cash, collateral, margin, and the top non-zero balances returned by Crypto.com.
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    <div className="space-y-4 rounded-2xl border border-border bg-background/40 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <SummaryMetric label="Available" value={formatUsd(cryptoComOverview?.totalAvailableBalanceUsd)} />
                        <SummaryMetric label="Cash" value={formatUsd(cryptoComOverview?.totalCashBalanceUsd)} />
                        <SummaryMetric label="Collateral" value={formatUsd(cryptoComOverview?.totalCollateralValueUsd)} />
                        <SummaryMetric label="Initial Margin" value={formatUsd(cryptoComOverview?.totalInitialMarginUsd)} />
                        <SummaryMetric label="Maintenance" value={formatUsd(cryptoComOverview?.totalMaintenanceMarginUsd)} />
                      </div>

                      <div>
                        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Top balances</div>
                        {topBalances.length === 0 ? (
                          <div className="mt-3 rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-8 text-center text-sm text-muted-foreground">
                            No non-zero Crypto.com balances were returned.
                          </div>
                        ) : (
                          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                            <table className="w-full min-w-[620px]">
                              <thead>
                                <tr className="border-b border-border">
                                  {["Asset", "Quantity", "Reserved", "Market Value", "Max Withdraw"].map((heading) => (
                                    <th
                                      key={heading}
                                      className="px-4 py-3 text-right text-[11px] font-mono uppercase tracking-wider text-muted-foreground first:text-left"
                                    >
                                      {heading}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {topBalances.map((asset) => (
                                  <tr key={asset.currency} className="border-b border-border last:border-b-0">
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary/20">
                                          <Wallet className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="text-sm font-mono font-semibold text-foreground">{asset.currency}</div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                                      {formatToken(asset.quantity, asset.currency)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                                      {formatToken(asset.reservedQuantity, asset.currency)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                                      {formatUsd(asset.marketValueUsd)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">
                                      {formatToken(asset.maxWithdrawalBalance, asset.currency)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ) : null}
            </Accordion>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <PublicExchangeCard exchange="kraken" health={healthByExchange.get("kraken")} />
          <PublicExchangeCard exchange="coinbase" health={healthByExchange.get("coinbase")} />
          <Card className="animate-fade-up">
            <CardHeader className="pb-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Venue Map</div>
              <div className="mt-2 text-lg font-mono font-semibold text-foreground">All Exchanges</div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Landmark className="mt-0.5 h-4 w-4 text-primary" />
                <div>Crypto.com is the authenticated venue in this pane.</div>
              </div>
              <div className="flex items-start gap-3">
                <Activity className="mt-0.5 h-4 w-4 text-primary" />
                <div>Kraken and Coinbase stay visible as live public-market venues.</div>
              </div>
              <div className="flex items-start gap-3">
                <Coins className="mt-0.5 h-4 w-4 text-primary" />
                <div>Use the Market Intel tab to compare prices and liquidity across all of them.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
