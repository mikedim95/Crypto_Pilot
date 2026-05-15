import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMinerDetails } from "@/hooks/useTradingData";

interface MinerWebPageProps {
  minerId: number | undefined;
  onBack: () => void;
}

function buildMinerPageUrl(apiBaseUrl: string | null | undefined, ip: string | null | undefined): string {
  const raw = apiBaseUrl?.trim() || (ip?.trim() ? `http://${ip.trim()}` : "");
  return raw.replace(/\/+$/, "");
}

export function MinerWebPage({ minerId, onBack }: MinerWebPageProps) {
  const [frameKey, setFrameKey] = useState(0);
  const { data, isPending, error } = useMinerDetails(minerId);
  const miner = data?.miner;
  const minerPageUrl = useMemo(() => buildMinerPageUrl(miner?.apiBaseUrl, miner?.ip), [miner?.apiBaseUrl, miner?.ip]);

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 sm:p-4 md:gap-4 md:p-6">
      <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="Back to fleet">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Live Miner Page</div>
                {isPending && !miner ? (
                  <Skeleton className="mt-2 h-5 w-44" />
                ) : (
                  <h2 className="mt-1 truncate font-mono text-lg font-semibold text-foreground">
                    {miner?.name ?? "Miner unavailable"}
                  </h2>
                )}
              </div>
            </div>

            {miner ? (
              <div className="mt-2 truncate pl-11 font-mono text-xs text-muted-foreground">
                {miner.model ?? "Unknown model"} | {miner.ip} | {miner.firmware ?? "Unknown firmware"}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="gap-2 font-mono text-xs"
              disabled={!minerPageUrl}
              onClick={() => setFrameKey((current) => current + 1)}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
            {minerPageUrl ? (
              <Button asChild className="gap-2 font-mono text-xs">
                <a href={minerPageUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open Tab
                </a>
              </Button>
            ) : (
              <Button className="gap-2 font-mono text-xs" disabled>
                <ExternalLink className="h-4 w-4" />
                Open Tab
              </Button>
            )}
          </div>
        </div>
      </div>

      {error instanceof Error ? (
        <div className="rounded-lg border border-negative/40 bg-negative/10 p-3 text-sm text-negative sm:p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>{error.message}</div>
          </div>
        </div>
      ) : null}

      <div className="min-h-[520px] flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {isPending && !miner ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-[480px] w-full" />
          </div>
        ) : minerPageUrl ? (
          <iframe
            key={`${minerPageUrl}-${frameKey}`}
            title={miner ? `${miner.name} live miner page` : "Live miner page"}
            src={minerPageUrl}
            className="h-[calc(100svh-12rem)] min-h-[520px] w-full bg-background"
          />
        ) : (
          <div className="flex min-h-[520px] items-center justify-center p-6 text-center">
            <div className="max-w-md">
              <div className="font-mono text-sm text-foreground">No live page URL is available for this miner.</div>
              <div className="mt-2 text-xs text-muted-foreground">Verify the miner so the fleet database stores its VNish URL.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
