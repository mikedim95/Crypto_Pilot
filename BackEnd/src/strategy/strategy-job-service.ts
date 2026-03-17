import { BacktestEngine } from "./backtest-engine.js";
import { PersistedHistoricalCandleProvider } from "./historical-market-data.js";
import { StrategyRepository } from "./strategy-repository.js";
import { StrategyRunner } from "./strategy-runner.js";
import { StrategyUserScope } from "./strategy-user-scope.js";
import {
  BacktestRequest,
  CandidateEvaluationRequest,
  HistoricalCandleSyncRequest,
  PortfolioAccountType,
  StrategyAlertType,
  StrategyJob,
  StrategyJobType,
} from "./types.js";

const JOB_RETRY_BASE_DELAY_MS = Math.max(
  5_000,
  Number.parseInt(String(process.env.STRATEGY_JOB_RETRY_BASE_DELAY_MS ?? "30000"), 10) || 30_000
);
const DEFAULT_JOB_MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(String(process.env.STRATEGY_JOB_MAX_ATTEMPTS ?? "3"), 10) || 3
);

function intervalToMs(interval: "1h" | "1d"): number {
  return interval === "1h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

function buildRetryNextRunAt(attempts: number): string {
  const delayMs = JOB_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
  return new Date(Date.now() + delayMs).toISOString();
}

function toScopedPayload(
  strategyId: string | undefined,
  request: Record<string, unknown>,
  userScope?: StrategyUserScope
): Record<string, unknown> {
  return {
    strategyId,
    request,
    userScope: userScope
      ? {
          userId: userScope.userId,
          username: userScope.username,
        }
      : undefined,
  };
}

function parseUserScope(payload: Record<string, unknown>): StrategyUserScope | undefined {
  const entry = payload.userScope;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }

  const shape = entry as Record<string, unknown>;
  const userId =
    typeof shape.userId === "number" && Number.isInteger(shape.userId) && shape.userId > 0 ? shape.userId : undefined;
  const username =
    typeof shape.username === "string" && shape.username.trim().length > 0 ? shape.username.trim().toLowerCase() : undefined;

  if (!userId && !username) {
    return undefined;
  }

  return { userId, username };
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseBacktestRequest(payload: Record<string, unknown>): BacktestRequest {
  const request = parseRecord(payload.request);
  return {
    strategyId: String(request.strategyId ?? payload.strategyId ?? "").trim(),
    startDate: String(request.startDate ?? ""),
    endDate: String(request.endDate ?? ""),
    initialCapital: Number(request.initialCapital ?? 0),
    baseCurrency: String(request.baseCurrency ?? "USDC"),
    timeframe: request.timeframe === "1h" ? "1h" : "1d",
    rebalanceCostsPct: Number(request.rebalanceCostsPct ?? 0.001),
    slippagePct: Number(request.slippagePct ?? 0.001),
  };
}

function parseCandidateEvaluationRequest(payload: Record<string, unknown>): CandidateEvaluationRequest {
  const request = parseRecord(payload.request);
  return {
    strategyId: String(request.strategyId ?? payload.strategyId ?? "").trim(),
    startDate: String(request.startDate ?? ""),
    endDate: String(request.endDate ?? ""),
    initialCapital: Number(request.initialCapital ?? 10_000),
    baseCurrency: String(request.baseCurrency ?? "USDC"),
    validationDays: Number(request.validationDays ?? 45),
    rebalanceCostsPct: Number(request.rebalanceCostsPct ?? 0.001),
    slippagePct: Number(request.slippagePct ?? 0.001),
  };
}

function parseCandleSyncRequest(payload: Record<string, unknown>): HistoricalCandleSyncRequest {
  const request = parseRecord(payload.request);
  return {
    symbol: String(request.symbol ?? "").trim().toUpperCase(),
    interval: request.interval === "1h" ? "1h" : "1d",
    startTime: String(request.startTime ?? ""),
    endTime: String(request.endTime ?? ""),
  };
}

function parseProjectedOutcomePayload(payload: Record<string, unknown>): {
  strategyId: string;
  accountType: PortfolioAccountType;
} {
  const request = parseRecord(payload.request);
  return {
    strategyId: String(request.strategyId ?? payload.strategyId ?? "").trim(),
    accountType: request.accountType === "demo" ? "demo" : "real",
  };
}

export class StrategyJobService {
  constructor(
    private readonly repository: StrategyRepository,
    private readonly backtestEngine: BacktestEngine,
    private readonly runner: StrategyRunner,
    private readonly candleProvider: PersistedHistoricalCandleProvider
  ) {}

  async enqueueBacktest(request: BacktestRequest, userScope?: StrategyUserScope): Promise<StrategyJob> {
    return this.repository.createStrategyJob({
      type: "run_backtest",
      payload: toScopedPayload(request.strategyId, request as unknown as Record<string, unknown>, userScope),
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
    });
  }

  async enqueueCandidateEvaluation(
    request: CandidateEvaluationRequest,
    userScope?: StrategyUserScope
  ): Promise<StrategyJob> {
    return this.repository.createStrategyJob({
      type: "evaluate_strategy_candidate",
      payload: toScopedPayload(request.strategyId, request as unknown as Record<string, unknown>, userScope),
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
    });
  }

  async enqueueHistoricalCandleSync(
    request: HistoricalCandleSyncRequest,
    userScope?: StrategyUserScope
  ): Promise<StrategyJob> {
    return this.repository.createStrategyJob({
      type: "sync_historical_candles",
      payload: toScopedPayload(undefined, request as unknown as Record<string, unknown>, userScope),
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
    });
  }

  async enqueueProjectedOutcomeRefresh(
    strategyId: string,
    accountType: PortfolioAccountType = "real",
    userScope?: StrategyUserScope
  ): Promise<StrategyJob> {
    return this.repository.createStrategyJob({
      type: "refresh_projected_outcome",
      payload: toScopedPayload(strategyId, { strategyId, accountType }, userScope),
      maxAttempts: DEFAULT_JOB_MAX_ATTEMPTS,
    });
  }

  async processDueJobs(limit = 1): Promise<number> {
    const jobs = await this.repository.claimDueStrategyJobs(new Date().toISOString(), limit);
    let processed = 0;

    for (const job of jobs) {
      processed += 1;
      try {
        const result = await this.processJob(job);
        await this.repository.completeStrategyJob(job.id, result);
      } catch (error) {
        await this.handleFailure(job, error);
      }
    }

    return processed;
  }

  private async processJob(job: StrategyJob): Promise<Record<string, unknown>> {
    const payload = parseRecord(job.payload);
    const userScope = parseUserScope(payload);

    switch (job.type) {
      case "run_backtest": {
        const request = parseBacktestRequest(payload);
        const result = userScope
          ? await this.backtestEngine.runBacktest(request, userScope)
          : await this.backtestEngine.runBacktest(request);
        return {
          strategyId: request.strategyId,
          backtestRunId: result.run.id,
          status: result.run.status,
          finalValue: result.run.finalValue,
          totalReturnPct: result.run.totalReturnPct,
          stepCount: result.steps.length,
        };
      }
      case "evaluate_strategy_candidate": {
        const request = parseCandidateEvaluationRequest(payload);
        const evaluation = await this.backtestEngine.evaluateCandidateStrategy(request, userScope);
        return {
          strategyId: request.strategyId,
          evaluationId: evaluation.id,
          riskGatePassed: evaluation.riskGatePassed,
          recommendedApprovalState: evaluation.recommendedApprovalState,
          validationReturnPct: evaluation.validationMetrics.totalReturnPct,
        };
      }
      case "sync_historical_candles": {
        const request = parseCandleSyncRequest(payload);
        const startTime = new Date(request.startTime).getTime();
        const endTime = new Date(request.endTime).getTime();
        const candles = await this.candleProvider.getCandles(request.symbol, request.interval, startTime, endTime);
        const expectedCount = Math.floor((endTime - startTime) / intervalToMs(request.interval)) + 1;

        if (candles.length < expectedCount) {
          await this.repository.createAlert({
            type: "stale_historical_data",
            severity: "warning",
            message: `Historical candle coverage for ${request.symbol} ${request.interval} is incomplete.`,
            payload: {
              symbol: request.symbol,
              interval: request.interval,
              expectedCount,
              actualCount: candles.length,
              startTime: request.startTime,
              endTime: request.endTime,
            },
          });
        }

        return {
          symbol: request.symbol,
          interval: request.interval,
          candleCount: candles.length,
          expectedCount,
          startTime: request.startTime,
          endTime: request.endTime,
        };
      }
      case "refresh_projected_outcome": {
        const request = parseProjectedOutcomePayload(payload);
        const state = await this.runner.evaluateStrategyState(request.strategyId, request.accountType, userScope);
        if (!state?.evaluation.projectedOutcome) {
          throw new Error(`Unable to refresh projected outcome for strategy ${request.strategyId}.`);
        }

        return {
          strategyId: request.strategyId,
          accountType: request.accountType,
          generatedAt: state.evaluation.projectedOutcome.generatedAt,
          driftPct: state.evaluation.projectedOutcome.driftPct,
          estimatedTurnoverPct: state.evaluation.projectedOutcome.estimatedTurnoverPct,
        };
      }
      default:
        throw new Error(`Unsupported strategy job type: ${(job as { type: string }).type}`);
    }
  }

  private async handleFailure(job: StrategyJob, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Strategy job failed.";
    const attemptsRemaining = job.attempts < job.maxAttempts;
    const alertType = this.resolveAlertType(job.type);

    await this.repository.createAlert({
      type: alertType,
      severity: "error",
      message,
      payload: {
        jobId: job.id,
        jobType: job.type,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
      },
    });

    if (attemptsRemaining) {
      await this.repository.rescheduleStrategyJob(job.id, message, buildRetryNextRunAt(job.attempts));
      return;
    }

    await this.repository.failStrategyJob(job.id, message);
  }

  private resolveAlertType(jobType: StrategyJobType): StrategyAlertType {
    if (jobType === "sync_historical_candles") {
      return "candle_sync_failure";
    }
    if (jobType === "evaluate_strategy_candidate") {
      return "evaluation_failure";
    }
    return "scheduler_job_failure";
  }
}
