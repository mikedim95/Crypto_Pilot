import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldMinus, ShieldX } from "lucide-react";
import { backendApi } from "@/lib/api";
import { useDashboardData, useExecutionGuardrailSettings } from "@/hooks/useTradingData";
import { cn } from "@/lib/utils";
import type {
  DecisionIntelligenceResponse,
  ExecutionGuardrailAction,
  ExecutionGuardrailEvaluationResponse,
  ExecutionGuardrailSettings,
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

interface GuardrailSettingsDraft {
  minConfidence: string;
  maxPositionSizePct: string;
  maxBtcExposurePct: string;
  cooldownMinutes: string;
  maxDailyTurnoverPct: string;
  newsShockBearishBias: string;
  volatilityLockoutThreshold: string;
  mildReductionFactor: string;
}

function settingsToDraft(settings: ExecutionGuardrailSettings): GuardrailSettingsDraft {
  return {
    minConfidence: String(settings.minConfidence),
    maxPositionSizePct: String(settings.maxPositionSizePct),
    maxBtcExposurePct: String(settings.maxBtcExposurePct),
    cooldownMinutes: String(settings.cooldownMinutes),
    maxDailyTurnoverPct: String(settings.maxDailyTurnoverPct),
    newsShockBearishBias: String(settings.newsShockBearishBias),
    volatilityLockoutThreshold: String(settings.volatilityLockoutThreshold),
    mildReductionFactor: String(settings.mildReductionFactor),
  };
}

function parseSettingsDraft(draft: GuardrailSettingsDraft): ExecutionGuardrailSettings {
  const parsed = {
    minConfidence: Number(draft.minConfidence),
    maxPositionSizePct: Number(draft.maxPositionSizePct),
    maxBtcExposurePct: Number(draft.maxBtcExposurePct),
    cooldownMinutes: Number(draft.cooldownMinutes),
    maxDailyTurnoverPct: Number(draft.maxDailyTurnoverPct),
    newsShockBearishBias: Number(draft.newsShockBearishBias),
    volatilityLockoutThreshold: Number(draft.volatilityLockoutThreshold),
    mildReductionFactor: Number(draft.mildReductionFactor),
  };

  if (!Number.isFinite(parsed.minConfidence) || parsed.minConfidence < 0 || parsed.minConfidence > 1) {
    throw new Error("Min confidence must be between 0 and 1.");
  }
  if (!Number.isFinite(parsed.maxPositionSizePct) || parsed.maxPositionSizePct < 0 || parsed.maxPositionSizePct > 100) {
    throw new Error("Max position size must be between 0 and 100.");
  }
  if (!Number.isFinite(parsed.maxBtcExposurePct) || parsed.maxBtcExposurePct < 0 || parsed.maxBtcExposurePct > 100) {
    throw new Error("Max BTC exposure must be between 0 and 100.");
  }
  if (!Number.isFinite(parsed.cooldownMinutes) || parsed.cooldownMinutes <= 0) {
    throw new Error("Cooldown minutes must be greater than 0.");
  }
  if (!Number.isFinite(parsed.maxDailyTurnoverPct) || parsed.maxDailyTurnoverPct < 0 || parsed.maxDailyTurnoverPct > 100) {
    throw new Error("Max daily turnover must be between 0 and 100.");
  }
  if (!Number.isFinite(parsed.newsShockBearishBias)) {
    throw new Error("News shock bearish bias must be numeric.");
  }
  if (!Number.isFinite(parsed.volatilityLockoutThreshold) || parsed.volatilityLockoutThreshold <= 0) {
    throw new Error("Volatility lockout must be greater than 0.");
  }
  if (!Number.isFinite(parsed.mildReductionFactor) || parsed.mildReductionFactor < 0.1 || parsed.mildReductionFactor > 0.95) {
    throw new Error("Mild reduction factor must be between 0.1 and 0.95.");
  }

  return parsed;
}

export function ExecutionSafetyPanel({ accountType, decision }: ExecutionSafetyPanelProps) {
  const queryClient = useQueryClient();
  const { data: dashboard } = useDashboardData(accountType);
  const { data: settingsData, isPending: loadingSettings, error: settingsError } = useExecutionGuardrailSettings();
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<GuardrailSettingsDraft | null>(null);
  const [settingsFormError, setSettingsFormError] = useState("");
  const primaryAssetOption = resolvedAssetOptions[0] ?? "BTC";
  const hasSelectedAsset = resolvedAssetOptions.includes(asset);
  const settings = settingsData?.settings;

  useEffect(() => {
    if (!hasSelectedAsset) {
      setAsset(primaryAssetOption);
    }
  }, [hasSelectedAsset, primaryAssetOption]);

  useEffect(() => {
    if (settings) {
      setSettingsDraft(settingsToDraft(settings));
    }
  }, [settings]);

  const settingsMutation = useMutation({
    mutationFn: async () => {
      if (!settingsDraft) {
        throw new Error("Guardrail settings are not ready yet.");
      }
      return backendApi.updateExecutionGuardrailSettings(parseSettingsDraft(settingsDraft));
    },
    onSuccess: async (result) => {
      setSettingsFormError("");
      setSettingsDraft(settingsToDraft(result.settings));
      setIsSettingsOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["execution-guardrail-settings"] });
    },
    onError: (error) => {
      setSettingsFormError(error instanceof Error ? error.message : "Unable to save guardrail settings.");
    },
  });

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

      <div className="mt-5 rounded-xl border border-border bg-secondary/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Active Guardrails</div>
            <div className="mt-2 text-sm text-muted-foreground">
              These limits are stored per user on the backend and are applied to every future execution-safety evaluation.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSettingsFormError("");
                setIsSettingsOpen((current) => !current);
              }}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-3 font-mono text-xs text-foreground transition-colors hover:bg-secondary"
            >
              {isSettingsOpen ? "Hide Limits" : "Edit Limits"}
            </button>
          </div>
        </div>

        {settingsError ? (
          <div className="mt-4 rounded-md border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
            {settingsError instanceof Error ? settingsError.message : "Failed to load execution guardrail settings."}
          </div>
        ) : null}

        {settings ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-foreground">
              Min Confidence {formatPercent(settings.minConfidence * 100, 0)}
            </div>
            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-foreground">
              Asset Cap {formatPercent(settings.maxPositionSizePct)}
            </div>
            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-foreground">
              BTC Cap {formatPercent(settings.maxBtcExposurePct)}
            </div>
            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-foreground">
              Cooldown {settings.cooldownMinutes.toFixed(0)}m
            </div>
            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-foreground">
              Daily Turnover {formatPercent(settings.maxDailyTurnoverPct)}
            </div>
            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-foreground">
              News Shock {settings.newsShockBearishBias.toFixed(2)}
            </div>
            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-foreground">
              Vol Lockout {settings.volatilityLockoutThreshold.toFixed(4)}
            </div>
            <div className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-mono text-foreground">
              Mild Reduce x{settings.mildReductionFactor.toFixed(2)}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-out",
            isSettingsOpen ? "mt-4 max-h-[800px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Min Confidence</div>
              <input
                value={settingsDraft?.minConfidence ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) => (current ? { ...current, minConfidence: event.target.value } : current))
                }
                type="number"
                min={0}
                max={1}
                step="0.01"
                className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </label>
            <label className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Max Position %</div>
              <input
                value={settingsDraft?.maxPositionSizePct ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, maxPositionSizePct: event.target.value } : current
                  )
                }
                type="number"
                min={0}
                max={100}
                step="0.25"
                className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </label>
            <label className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Max BTC %</div>
              <input
                value={settingsDraft?.maxBtcExposurePct ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, maxBtcExposurePct: event.target.value } : current
                  )
                }
                type="number"
                min={0}
                max={100}
                step="0.25"
                className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </label>
            <label className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Cooldown Min</div>
              <input
                value={settingsDraft?.cooldownMinutes ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, cooldownMinutes: event.target.value } : current
                  )
                }
                type="number"
                min={1}
                step="1"
                className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </label>
            <label className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Daily Turnover %</div>
              <input
                value={settingsDraft?.maxDailyTurnoverPct ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, maxDailyTurnoverPct: event.target.value } : current
                  )
                }
                type="number"
                min={0}
                max={100}
                step="0.25"
                className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </label>
            <label className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">News Shock Bias</div>
              <input
                value={settingsDraft?.newsShockBearishBias ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, newsShockBearishBias: event.target.value } : current
                  )
                }
                type="number"
                step="0.1"
                className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </label>
            <label className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Vol Lockout</div>
              <input
                value={settingsDraft?.volatilityLockoutThreshold ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, volatilityLockoutThreshold: event.target.value } : current
                  )
                }
                type="number"
                min={0}
                step="0.0001"
                className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </label>
            <label className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Mild Reduction</div>
              <input
                value={settingsDraft?.mildReductionFactor ?? ""}
                onChange={(event) =>
                  setSettingsDraft((current) =>
                    current ? { ...current, mildReductionFactor: event.target.value } : current
                  )
                }
                type="number"
                min={0.1}
                max={0.95}
                step="0.01"
                className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/40"
              />
            </label>
          </div>

          {settingsFormError ? (
            <div className="mt-4 rounded-md border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
              {settingsFormError}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-xs text-muted-foreground">
              Use this panel for live execution limits. Strategy guards remain separate in the Strategies editor.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (settings) {
                    setSettingsDraft(settingsToDraft(settings));
                  }
                  setSettingsFormError("");
                }}
                disabled={!settings || loadingSettings || settingsMutation.isPending}
                className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-3 font-mono text-xs text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset Form
              </button>
              <button
                onClick={() => settingsMutation.mutate()}
                disabled={!settingsDraft || loadingSettings || settingsMutation.isPending}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 font-mono text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {settingsMutation.isPending ? "Saving..." : "Save Limits"}
              </button>
            </div>
          </div>
        </div>
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
