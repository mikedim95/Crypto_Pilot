import { ActivitySquare, BarChart3, Clock3, ShieldAlert, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignalReview } from "@/hooks/useTradingData";
import { cn } from "@/lib/utils";
import type {
  PortfolioAccountType,
  SignalReviewItem,
  SignalReviewMetricGroup,
  SignalReviewResponse,
} from "@/types/api";

interface SignalReviewPageProps {
  accountType: PortfolioAccountType;
}

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null) {
    return "Pending";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getOutcomeClassName(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-muted-foreground";
}

function getGuardrailStatusClassName(status: SignalReviewItem["guardrail_status"]): string {
  if (status === "allowed") {
    return "border-positive/30 bg-positive/10 text-positive";
  }
  if (status === "reduced") {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  }
  return "border-negative/30 bg-negative/10 text-negative";
}

function MetricTile({
  label,
  value,
  helper,
  className,
}: {
  label: string;
  value: string;
  helper?: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-fade-up">
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-2 text-lg font-mono font-semibold text-foreground", className)}>{value}</div>
      {helper ? <div className="mt-1 text-xs text-muted-foreground">{helper}</div> : null}
    </div>
  );
}

function SummaryGroupCard({
  title,
  icon: Icon,
  items,
  emptyText,
}: {
  title: string;
  icon: typeof Sparkles;
  items: SignalReviewMetricGroup[];
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-fade-up">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{title}</div>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          items.map((item) => (
            <div key={`${title}-${item.key}`} className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-mono text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.reviewed_count} reviewed signals</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-semibold text-foreground">{formatPercent(item.win_rate)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">win rate</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-2 h-4 w-[36rem] max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={`signal-review-metric-${index}`} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={`signal-review-group-${index}`} className="h-60 w-full" />
        ))}
      </div>
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center animate-fade-scale-in">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary/30 text-muted-foreground">
        <ActivitySquare className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-mono font-semibold text-foreground">No reviewed signals yet</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
        Signal snapshots will appear here after Execution Safety evaluations are run. Matured 1h, 6h, and 24h outcomes
        are filled in as price history becomes available.
      </p>
    </div>
  );
}

export function SignalReviewPage({ accountType }: SignalReviewPageProps) {
  const { data, isPending, error } = useSignalReview(accountType);
  const isLoading = isPending && !data;

  if (isLoading) {
    return <LoadingState />;
  }

  if (error && !data) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-md border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          {error instanceof Error ? error.message : "Failed to load signal review."}
        </div>
      </div>
    );
  }

  const review = data as SignalReviewResponse | undefined;
  if (!review || review.signals.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-lg md:text-xl font-mono font-semibold text-foreground">Signal Review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track whether recent signal contexts helped or hurt once time passes.
          </p>
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-mono font-semibold text-foreground">Signal Review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Action-adjusted signal tracking. Buy is positive when price rose, sell is positive when price fell, and hold
            is helpful when BTC stayed roughly range-bound.
          </p>
        </div>
        <div className="text-xs font-mono text-muted-foreground">Account context: {accountType.toUpperCase()}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 stagger-children">
        <MetricTile
          label="Average Helpfulness"
          value={review.summary.average_helpfulness === null ? "--" : formatPercent(review.summary.average_helpfulness)}
          helper="Across all matured 1h, 6h, and 24h review slots."
        />
        <MetricTile label="Reviewed Signals" value={String(review.summary.reviewed_signal_count)} />
        <MetricTile label="Pending Review" value={String(review.summary.pending_review_count)} />
        <MetricTile label="Total Signals" value={String(review.summary.total_signals)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SummaryGroupCard
          title="Win Rate By Recommendation"
          icon={Sparkles}
          items={review.summary.win_rate_by_recommendation}
          emptyText="No reviewed recommendation groups yet."
        />
        <SummaryGroupCard
          title="Win Rate By Regime"
          icon={BarChart3}
          items={review.summary.win_rate_by_regime}
          emptyText="No reviewed market regimes yet."
        />
        <SummaryGroupCard
          title="Win Rate By News State"
          icon={Clock3}
          items={review.summary.win_rate_by_news_state}
          emptyText="No reviewed news states yet."
        />
      </div>

      <div className="rounded-xl border border-border bg-card animate-fade-up overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Recent Signals</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Latest guardrail-reviewed signals with pending or matured 1h, 6h, and 24h outcomes.
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/30 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            Review Queue
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border">
                {["Created", "Asset", "Action", "Status", "Recommendation", "Regime", "Confidence", "1h", "6h", "24h"].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {review.signals.map((signal) => (
                <tr key={signal.id} className="border-b border-border align-top last:border-b-0">
                  <td className="px-4 py-4 text-sm font-mono text-foreground">
                    <div>{formatTimestamp(signal.created_at)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{signal.account_type.toUpperCase()}</div>
                  </td>
                  <td className="px-4 py-4 text-sm font-mono text-foreground">{signal.asset}</td>
                  <td className="px-4 py-4 text-sm">
                    <div className="font-mono uppercase text-foreground">{signal.action_taken}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {signal.adjusted_size !== null ? formatPercent(signal.adjusted_size, 2) : "n/a"}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider",
                        getGuardrailStatusClassName(signal.guardrail_status)
                      )}
                    >
                      {signal.guardrail_status}
                    </div>
                    {signal.triggered_guardrails.length > 0 ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {signal.triggered_guardrails.slice(0, 2).map((item) => titleCase(item)).join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-sm font-mono text-foreground">{titleCase(signal.recommendation)}</td>
                  <td className="px-4 py-4 text-sm font-mono text-foreground">{titleCase(signal.market_regime)}</td>
                  <td className="px-4 py-4 text-sm font-mono text-foreground">{formatPercent(signal.confidence)}</td>
                  <td className={cn("px-4 py-4 text-sm font-mono", getOutcomeClassName(signal.pnl_after_1h))}>
                    {formatSignedPercent(signal.pnl_after_1h)}
                  </td>
                  <td className={cn("px-4 py-4 text-sm font-mono", getOutcomeClassName(signal.pnl_after_6h))}>
                    {formatSignedPercent(signal.pnl_after_6h)}
                  </td>
                  <td className={cn("px-4 py-4 text-sm font-mono", getOutcomeClassName(signal.pnl_after_24h))}>
                    {formatSignedPercent(signal.pnl_after_24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
