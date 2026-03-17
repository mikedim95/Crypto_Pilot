import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldMinus, ShieldX } from "lucide-react";
import { backendApi } from "@/lib/api";
import { useDashboardData } from "@/hooks/useTradingData";
import { cn } from "@/lib/utils";
import type {
  DecisionIntelligenceResponse,
  ExecutionGuardrailAction,
  ExecutionGuardrailEvaluationResponse,
  ExecutionGuardrailStatus,
  PortfolioAccountType,
} from "@/types/api";

interface ExecutionSafetyPanelProps {
  accountType: PortfolioAccountType;
  decision: DecisionIntelligenceResponse;
}

const STATUS_META: Record<
  ExecutionGuardrailStatus,
  {
    label: string;
    badgeClassName: string;
    icon: typeof ShieldCheck;
    helper: string;
  }
> = {
  allowed: {
    label: "Allowed",
    badgeClassName: "border-positive/30 bg-positive/10 text-positive",
    icon: ShieldCheck,
    helper: "The proposed action passes the active deterministic safety checks.",
  },
  reduced: {
    label: "Reduced",
    badgeClassName: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
    icon: ShieldMinus,
    helper: "The action is not fully blocked, but the allowed size has been cut down.",
  },
  blocked: {
    label: "Blocked",
    badgeClassName: "border-negative/30 bg-negative/10 text-negative",
    icon: ShieldX,
    helper: "One or more guardrails actively prevent this action from moving forward.",
  },
};

function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

function formatGuardrailName(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ExecutionSafetyPanel({ accountType, decision }: ExecutionSafetyPanelProps) {
  const { data: dashboard } = useDashboardData(accountType);
  const seen = new Set<string>();
  const assetOptions = (dashboard?.assets ?? [])
    .map((assetItem) => assetItem.symbol.toUpperCase())
    .filter((symbol) => {
      if (!symbol || seen.has(symbol)) {
        return false;
      }
      seen.add(symbol);
      return true;
    });
  const resolvedAssetOptions = assetOptions.length > 0 ? assetOptions : ["BTC"];

  const [proposedAction, setProposedAction] = useState<ExecutionGuardrailAction>("buy");
  const [asset, setAsset] = useState("BTC");
  const [requestedSize, setRequestedSize] = useState("5");
  const primaryAssetOption = resolvedAssetOptions[0] ?? "BTC";
  const hasSelectedAsset = resolvedAssetOptions.includes(asset);

  useEffect(() => {
    if (!hasSelectedAsset) {
      setAsset(primaryAssetOption);
    }
  }, [hasSelectedAsset, primaryAssetOption]);

  const evaluationMutation = useMutation({
    mutationFn: () =>
      backendApi.evaluateExecutionGuardrails({
        accountType,
        proposedAction,
        asset,
        requestedSize: Number(requestedSize) || 0,
        decisionContext: decision,
      }),
  });

  const evaluation = evaluationMutation.data as ExecutionGuardrailEvaluationResponse | undefined;
  const statusMeta = evaluation ? STATUS_META[evaluation.status] : null;
  const StatusIcon = statusMeta?.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-fade-up">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Execution Safety</div>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Run a pre-trade safety pass against the current decision context. This records the signal snapshot, but it
            never places orders.
          </div>
        </div>
        <div className="text-xs font-mono text-muted-foreground">Context source: live decision + portfolio state</div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Proposed Action</div>
          <select
            value={proposedAction}
            onChange={(event) => setProposedAction(event.target.value as ExecutionGuardrailAction)}
            className="h-12 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="hold">Hold</option>
          </select>
        </label>

        <label className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Asset</div>
          <select
            value={asset}
            onChange={(event) => setAsset(event.target.value)}
            className="h-12 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
          >
            {resolvedAssetOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Requested Size %</div>
          <input
            value={requestedSize}
            onChange={(event) => setRequestedSize(event.target.value)}
            type="number"
            min={0}
            max={100}
            step="0.25"
            className="h-12 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-muted-foreground">
          Size is treated as a portfolio exposure delta for guardrail checks.
        </div>
        <button
          onClick={() => evaluationMutation.mutate()}
          disabled={evaluationMutation.isPending}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {evaluationMutation.isPending ? "Evaluating..." : "Evaluate Guardrails"}
        </button>
      </div>

      {evaluationMutation.error ? (
        <div className="mt-4 rounded-md border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          {evaluationMutation.error instanceof Error
            ? evaluationMutation.error.message
            : "Failed to evaluate execution safety."}
        </div>
      ) : null}

      {evaluation && statusMeta && StatusIcon ? (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-xl border border-border bg-secondary/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-mono uppercase tracking-wider",
                  statusMeta.badgeClassName
                )}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {statusMeta.label}
              </div>
              <div className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {asset} {proposedAction.toUpperCase()}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Status</div>
                <div className="mt-2 text-sm leading-6 text-foreground">{statusMeta.helper}</div>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-3">
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Requested Size</div>
                <div className="mt-2 text-xl font-mono font-semibold text-foreground">{formatPercent(Number(requestedSize) || 0)}</div>
              </div>
              {evaluation.status === "reduced" && evaluation.adjusted_size !== null ? (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-yellow-200/70">Adjusted Size</div>
                  <div className="mt-2 text-xl font-mono font-semibold text-yellow-300">
                    {formatPercent(evaluation.adjusted_size)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/20 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Reasons</div>
              </div>
              <div className="mt-4 space-y-3">
                {evaluation.reasons.map((reason, index) => (
                  <div key={`guardrail-reason-${index}`} className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground">
                    {reason}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/20 p-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Triggered Guardrails</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {evaluation.triggered_guardrails.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs font-mono text-muted-foreground">
                    No guardrail was triggered.
                  </div>
                ) : (
                  evaluation.triggered_guardrails.map((guardrail) => (
                    <div
                      key={guardrail}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-foreground"
                    >
                      {formatGuardrailName(guardrail)}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
