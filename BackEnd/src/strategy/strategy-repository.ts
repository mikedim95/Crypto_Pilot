import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestStep,
  DemoAccountHolding,
  DemoAccountSettings,
  ExecutionPlan,
  HistoricalCandle,
  RebalanceAllocationProfile,
  StrategyAlert,
  StrategyAlertType,
  StrategyApprovalState,
  StrategyCandidateEvaluationSummary,
  StrategyConfig,
  StrategyJob,
  StrategyJobStatus,
  StrategyJobType,
  StrategyRiskControls,
  StrategyRun,
  StrategyRunStatus,
  StrategyStoreData,
  StrategyVersionRecord,
} from "./types.js";
import { buildPresetStrategies } from "./strategy-presets.js";
import { createNextRunAt, normalizeAllocation } from "./allocation-utils.js";
import { StrategyUserScope } from "./strategy-user-scope.js";

const DEFAULT_DEMO_ACCOUNT_BALANCE = 10_000;
const DEFAULT_DEMO_UPDATED_AT = new Date().toISOString();
const DEFAULT_ACTIVE_USER = "dummy_alice";
const DEFAULT_DUMMY_PASSWORD = "demo123";
const MAX_PERSISTED_STRATEGY_RUNS = 200;
const MAX_PERSISTED_EXECUTION_PLANS = 200;
const MAX_PERSISTED_BACKTEST_RUNS = 50;
const MAX_PERSISTED_BACKTEST_STEPS = 500;
const MAX_PERSISTED_STRATEGY_VERSIONS_PER_STRATEGY = 25;
const MAX_PERSISTED_STRATEGY_EVALUATIONS_PER_STRATEGY = 20;
const DUMMY_USERS = [
  {
    userId: 1,
    username: "dummy_alice",
    email: "dummy_alice@myapp.local",
    password: DEFAULT_DUMMY_PASSWORD,
  },
  {
    userId: 2,
    username: "dummy_bob",
    email: "dummy_bob@myapp.local",
    password: DEFAULT_DUMMY_PASSWORD,
  },
] as const;
const DUMMY_USERS_BY_ID = new Map<number, (typeof DUMMY_USERS)[number]>(DUMMY_USERS.map((user) => [user.userId, user]));
const DUMMY_USERS_BY_USERNAME = new Map<string, (typeof DUMMY_USERS)[number]>(
  DUMMY_USERS.map((user) => [user.username, user])
);

export type StrategyRepositoryStorageMode = "database" | "offline";

export interface StrategyRepositoryStatus {
  storageMode: StrategyRepositoryStorageMode;
  databaseAvailable: boolean;
  message: string;
  dummyCredentials?: Array<{
    username: string;
    password: string;
  }>;
}

export interface StrategyRepositorySession {
  userId?: number;
  username: string;
  storageMode: StrategyRepositoryStorageMode;
  databaseAvailable: boolean;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function hashPassword(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim().length > 0 ? code : null;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const nestedMessages = error.errors
      .map((entry) => formatErrorMessage(entry))
      .filter((message) => message.trim().length > 0);
    if (nestedMessages.length > 0) {
      return nestedMessages.join("; ");
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) return message;
    const code = extractErrorCode(error);
    if (code) return code;
    return error.name;
  }

  const code = extractErrorCode(error);
  if (code) return code;
  if (typeof error === "string" && error.trim().length > 0) return error.trim();
  return "Unknown database error.";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }
  return chunks;
}

function toSqlDateTime(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - date.getMilliseconds()).toISOString().slice(0, 19).replace("T", " ");
}

function fromSqlDateTime(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  if (typeof value === "object") {
    return value as T;
  }

  return fallback;
}

interface HistoricalCandleRow extends RowDataPacket {
  symbol: string;
  interval_value: "1h" | "1d";
  open_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  close_time: number;
}

interface StrategyJobRow extends RowDataPacket {
  id: string;
  type: StrategyJobType;
  status: StrategyJobStatus;
  payload: unknown;
  result: unknown;
  error: string | null;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StrategyAlertRow extends RowDataPacket {
  id: string;
  type: StrategyAlertType;
  severity: "warning" | "error";
  message: string;
  payload: unknown;
  created_at: string;
}

const RETRYABLE_DB_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "PROTOCOL_CONNECTION_LOST",
  "ER_CON_COUNT_ERROR",
  "ER_SERVER_SHUTDOWN",
  "ER_CANT_CONNECT_TO_HOST",
  "ER_GET_CONNECTION_TIMEOUT",
]);

function shouldRetryDatabaseInitialization(error: unknown): boolean {
  if (error instanceof AggregateError) {
    return error.errors.some((entry) => shouldRetryDatabaseInitialization(entry));
  }

  const code = extractErrorCode(error);
  if (code && RETRYABLE_DB_ERROR_CODES.has(code)) {
    return true;
  }

  const message = formatErrorMessage(error).toLowerCase();
  return (
    message.includes("econnrefused") ||
    message.includes("connect econnrefused") ||
    message.includes("connection refused") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("getaddrinfo") ||
    message.includes("can't connect")
  );
}

const DB_INIT_RETRY_INTERVAL_MS = parsePositiveInteger(
  process.env.STRATEGY_DB_INIT_RETRY_INTERVAL_MS,
  5_000
);
const DB_INIT_MAX_RETRIES = parseNonNegativeInteger(
  process.env.STRATEGY_DB_INIT_MAX_RETRIES,
  0
);

function createDefaultDemoAccountSettings(): DemoAccountSettings {
  return {
    balance: parsePositiveNumber(process.env.DEMO_ACCOUNT_CAPITAL, DEFAULT_DEMO_ACCOUNT_BALANCE),
    updatedAt: DEFAULT_DEMO_UPDATED_AT,
    holdings: [],
  };
}

function normalizeStrategyApprovalState(value: unknown): StrategyApprovalState {
  if (value === "testing" || value === "paper" || value === "approved" || value === "rejected") {
    return value;
  }
  return "draft";
}

function normalizeStrategyRiskControls(entry: unknown): StrategyRiskControls {
  if (!entry || typeof entry !== "object") {
    return {
      requirePositiveValidationReturn: true,
      requireTrainValidationSplit: true,
    };
  }

  const shape = entry as Partial<StrategyRiskControls>;
  return {
    maxValidationDrawdownPct:
      typeof shape.maxValidationDrawdownPct === "number" && Number.isFinite(shape.maxValidationDrawdownPct)
        ? shape.maxValidationDrawdownPct
        : undefined,
    minValidationReturnPct:
      typeof shape.minValidationReturnPct === "number" && Number.isFinite(shape.minValidationReturnPct)
        ? shape.minValidationReturnPct
        : undefined,
    maxValidationTurnoverPct:
      typeof shape.maxValidationTurnoverPct === "number" && Number.isFinite(shape.maxValidationTurnoverPct)
        ? shape.maxValidationTurnoverPct
        : undefined,
    requirePositiveValidationReturn: shape.requirePositiveValidationReturn !== false,
    requireTrainValidationSplit: shape.requireTrainValidationSplit !== false,
  };
}

function normalizeHistoricalCandle(entry: Partial<HistoricalCandle>): HistoricalCandle | null {
  const symbol = typeof entry.symbol === "string" ? entry.symbol.trim().toUpperCase() : "";
  const interval = entry.interval === "1h" ? "1h" : entry.interval === "1d" ? "1d" : null;
  const openTime =
    typeof entry.openTime === "number" && Number.isFinite(entry.openTime) && entry.openTime >= 0 ? entry.openTime : null;
  const closeTime =
    typeof entry.closeTime === "number" && Number.isFinite(entry.closeTime) && entry.closeTime >= 0 ? entry.closeTime : null;
  const open = typeof entry.open === "number" && Number.isFinite(entry.open) && entry.open > 0 ? entry.open : null;
  const high = typeof entry.high === "number" && Number.isFinite(entry.high) && entry.high > 0 ? entry.high : null;
  const low = typeof entry.low === "number" && Number.isFinite(entry.low) && entry.low > 0 ? entry.low : null;
  const close = typeof entry.close === "number" && Number.isFinite(entry.close) && entry.close > 0 ? entry.close : null;
  const volume =
    typeof entry.volume === "number" && Number.isFinite(entry.volume) && entry.volume >= 0 ? entry.volume : null;

  if (!symbol || !interval || openTime === null || closeTime === null || open === null || high === null || low === null || close === null || volume === null) {
    return null;
  }

  return {
    symbol,
    interval,
    openTime,
    open,
    high,
    low,
    close,
    volume,
    closeTime,
  };
}

function normalizeStrategyJob(entry: Partial<StrategyJob>): StrategyJob | null {
  const id = typeof entry.id === "string" && entry.id.trim().length > 0 ? entry.id : null;
  const type =
    entry.type === "sync_historical_candles" ||
    entry.type === "run_backtest" ||
    entry.type === "evaluate_strategy_candidate" ||
    entry.type === "refresh_projected_outcome"
      ? entry.type
      : null;
  const status =
    entry.status === "pending" || entry.status === "running" || entry.status === "completed" || entry.status === "failed"
      ? entry.status
      : null;
  const payload =
    entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
      ? (entry.payload as Record<string, unknown>)
      : {};
  const result =
    entry.result && typeof entry.result === "object" && !Array.isArray(entry.result)
      ? (entry.result as Record<string, unknown>)
      : undefined;
  const attempts =
    typeof entry.attempts === "number" && Number.isInteger(entry.attempts) && entry.attempts >= 0 ? entry.attempts : 0;
  const maxAttempts =
    typeof entry.maxAttempts === "number" && Number.isInteger(entry.maxAttempts) && entry.maxAttempts > 0
      ? entry.maxAttempts
      : 3;
  const nextRunAt = typeof entry.nextRunAt === "string" && entry.nextRunAt.trim().length > 0 ? entry.nextRunAt : null;
  const createdAt = typeof entry.createdAt === "string" && entry.createdAt.trim().length > 0 ? entry.createdAt : null;
  const updatedAt = typeof entry.updatedAt === "string" && entry.updatedAt.trim().length > 0 ? entry.updatedAt : null;

  if (!id || !type || !status || !nextRunAt || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    type,
    status,
    payload,
    result,
    error: typeof entry.error === "string" && entry.error.trim().length > 0 ? entry.error.trim() : undefined,
    attempts,
    maxAttempts,
    nextRunAt,
    startedAt: typeof entry.startedAt === "string" && entry.startedAt.trim().length > 0 ? entry.startedAt : undefined,
    finishedAt:
      typeof entry.finishedAt === "string" && entry.finishedAt.trim().length > 0 ? entry.finishedAt : undefined,
    createdAt,
    updatedAt,
  };
}

function normalizeStrategyAlert(entry: Partial<StrategyAlert>): StrategyAlert | null {
  const id = typeof entry.id === "string" && entry.id.trim().length > 0 ? entry.id : null;
  const type =
    entry.type === "candle_sync_failure" ||
    entry.type === "stale_historical_data" ||
    entry.type === "evaluation_failure" ||
    entry.type === "scheduler_job_failure" ||
    entry.type === "approval_blocked_real_run" ||
    entry.type === "kill_switch_active"
      ? entry.type
      : null;
  const severity = entry.severity === "warning" || entry.severity === "error" ? entry.severity : null;
  const message = typeof entry.message === "string" && entry.message.trim().length > 0 ? entry.message.trim() : null;
  const createdAt = typeof entry.createdAt === "string" && entry.createdAt.trim().length > 0 ? entry.createdAt : null;
  const payload =
    entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
      ? (entry.payload as Record<string, unknown>)
      : undefined;

  if (!id || !type || !severity || !message || !createdAt) {
    return null;
  }

  return {
    id,
    type,
    severity,
    message,
    payload,
    createdAt,
  };
}

const DEFAULT_STORE: StrategyStoreData = {
  strategies: [],
  strategyVersions: [],
  strategyEvaluations: [],
  rebalanceAllocationProfiles: [],
  strategyRuns: [],
  executionPlans: [],
  backtestRuns: [],
  backtestSteps: [],
  demoAccount: createDefaultDemoAccountSettings(),
};

function normalizeExecutionPlan(entry: Partial<ExecutionPlan>): ExecutionPlan | null {
  if (
    typeof entry.id !== "string" ||
    typeof entry.strategyId !== "string" ||
    typeof entry.timestamp !== "string" ||
    typeof entry.mode !== "string"
  ) {
    return null;
  }

  return {
    ...(entry as ExecutionPlan),
    accountType: entry.accountType === "demo" ? "demo" : "real",
    warnings: Array.isArray(entry.warnings) ? entry.warnings : [],
    recommendedTrades: Array.isArray(entry.recommendedTrades) ? entry.recommendedTrades : [],
  };
}

function normalizeStrategyRun(entry: Partial<StrategyRun>): StrategyRun | null {
  if (
    typeof entry.id !== "string" ||
    typeof entry.strategyId !== "string" ||
    typeof entry.startedAt !== "string" ||
    typeof entry.status !== "string" ||
    typeof entry.mode !== "string" ||
    typeof entry.trigger !== "string"
  ) {
    return null;
  }

  return {
    ...(entry as StrategyRun),
    accountType: entry.accountType === "demo" ? "demo" : "real",
    warnings: Array.isArray(entry.warnings) ? entry.warnings : [],
  };
}

function normalizeDemoAccountHolding(entry: unknown): DemoAccountHolding | null {
  if (!entry || typeof entry !== "object") return null;

  const shape = entry as Partial<DemoAccountHolding>;
  const symbol = typeof shape.symbol === "string" ? shape.symbol.trim().toUpperCase() : "";
  const quantity = typeof shape.quantity === "number" && Number.isFinite(shape.quantity) && shape.quantity >= 0 ? shape.quantity : null;
  const targetAllocation =
    typeof shape.targetAllocation === "number" && Number.isFinite(shape.targetAllocation) && shape.targetAllocation >= 0
      ? shape.targetAllocation
      : 0;

  if (!symbol || quantity === null) return null;

  return {
    symbol,
    quantity,
    targetAllocation,
  };
}

function normalizeDemoAccountSettings(entry: unknown): DemoAccountSettings {
  if (!entry || typeof entry !== "object") {
    return createDefaultDemoAccountSettings();
  }

  const shape = entry as Partial<DemoAccountSettings>;
  const defaultSettings = createDefaultDemoAccountSettings();
  const balance =
    typeof shape.balance === "number" && Number.isFinite(shape.balance) && shape.balance > 0
      ? shape.balance
      : defaultSettings.balance;
  const updatedAt =
    typeof shape.updatedAt === "string" && shape.updatedAt.trim().length > 0
      ? shape.updatedAt
      : defaultSettings.updatedAt;
  const seededAt =
    typeof shape.seededAt === "string" && shape.seededAt.trim().length > 0 ? shape.seededAt : undefined;
  const holdings = Array.isArray(shape.holdings)
    ? shape.holdings
        .map((holding) => normalizeDemoAccountHolding(holding))
        .filter((holding): holding is DemoAccountHolding => holding !== null)
    : [];

  return {
    balance,
    updatedAt,
    seededAt,
    holdings,
  };
}

function normalizeAllocationMap(entry: unknown, fallbackSymbol = "USDC"): Record<string, number> {
  if (!entry || typeof entry !== "object") {
    return { [fallbackSymbol]: 100 };
  }

  const raw = entry as Record<string, unknown>;
  const normalized: Record<string, number> = {};
  Object.entries(raw).forEach(([symbol, value]) => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const safeValue = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    if (!normalizedSymbol || safeValue === null) return;
    normalized[normalizedSymbol] = safeValue;
  });

  if (Object.keys(normalized).length === 0) {
    return { [fallbackSymbol]: 100 };
  }

  return normalizeAllocation(normalized);
}

function normalizeRebalanceAllocationProfile(entry: unknown): RebalanceAllocationProfile | null {
  if (!entry || typeof entry !== "object") return null;

  const shape = entry as Partial<RebalanceAllocationProfile>;
  const id = typeof shape.id === "string" && shape.id.trim().length > 0 ? shape.id : null;
  const name = typeof shape.name === "string" && shape.name.trim().length > 0 ? shape.name.trim() : null;
  const strategyId =
    typeof shape.strategyId === "string" && shape.strategyId.trim().length > 0 ? shape.strategyId.trim() : null;
  const allocatedCapital =
    typeof shape.allocatedCapital === "number" && Number.isFinite(shape.allocatedCapital) && shape.allocatedCapital > 0
      ? shape.allocatedCapital
      : null;
  const baseCurrency =
    typeof shape.baseCurrency === "string" && shape.baseCurrency.trim().length > 0
      ? shape.baseCurrency.trim().toUpperCase()
      : "USDC";
  const allocation = normalizeAllocationMap(shape.allocation, baseCurrency);
  const holdings = Array.isArray(shape.holdings)
    ? shape.holdings
        .map((holding) => normalizeDemoAccountHolding(holding))
        .filter((holding): holding is DemoAccountHolding => holding !== null)
    : [];
  const executionPolicy =
    shape.executionPolicy === "on_strategy_run" || shape.executionPolicy === "interval"
      ? shape.executionPolicy
      : "manual";
  const autoExecuteMinDriftPct =
    typeof shape.autoExecuteMinDriftPct === "number" &&
    Number.isFinite(shape.autoExecuteMinDriftPct) &&
    shape.autoExecuteMinDriftPct >= 0
      ? shape.autoExecuteMinDriftPct
      : undefined;
  const scheduleInterval =
    typeof shape.scheduleInterval === "string" && shape.scheduleInterval.trim().length > 0
      ? shape.scheduleInterval.trim().toLowerCase()
      : undefined;
  const createdAt =
    typeof shape.createdAt === "string" && shape.createdAt.trim().length > 0 ? shape.createdAt : DEFAULT_DEMO_UPDATED_AT;
  const updatedAt =
    typeof shape.updatedAt === "string" && shape.updatedAt.trim().length > 0 ? shape.updatedAt : createdAt;

  if (!id || !name || !strategyId || allocatedCapital === null) {
    return null;
  }

  return {
    id,
    name,
    description: typeof shape.description === "string" && shape.description.trim().length > 0 ? shape.description.trim() : undefined,
    strategyId,
    allocatedCapital,
    baseCurrency,
    allocation,
    holdings,
    isEnabled: shape.isEnabled !== false,
    executionPolicy,
    autoExecuteMinDriftPct,
    scheduleInterval,
    lastEvaluatedAt:
      typeof shape.lastEvaluatedAt === "string" && shape.lastEvaluatedAt.trim().length > 0 ? shape.lastEvaluatedAt : undefined,
    lastExecutedAt:
      typeof shape.lastExecutedAt === "string" && shape.lastExecutedAt.trim().length > 0 ? shape.lastExecutedAt : undefined,
    nextExecutionAt:
      typeof shape.nextExecutionAt === "string" && shape.nextExecutionAt.trim().length > 0 ? shape.nextExecutionAt : undefined,
    createdAt,
    updatedAt,
  };
}

function normalizeStrategyEvaluationSummary(entry: unknown): StrategyCandidateEvaluationSummary | null {
  if (!entry || typeof entry !== "object") return null;

  const shape = entry as Partial<StrategyCandidateEvaluationSummary>;
  if (
    typeof shape.id !== "string" ||
    typeof shape.strategyId !== "string" ||
    !Number.isInteger(shape.strategyVersion) ||
    typeof shape.createdAt !== "string" ||
    !shape.trainWindow ||
    !shape.validationWindow ||
    typeof shape.trainBacktestRunId !== "string" ||
    typeof shape.validationBacktestRunId !== "string" ||
    !shape.trainMetrics ||
    !shape.validationMetrics
  ) {
    return null;
  }

  return {
    ...(shape as StrategyCandidateEvaluationSummary),
    riskChecks: Array.isArray(shape.riskChecks) ? shape.riskChecks : [],
    riskGatePassed: shape.riskGatePassed === true,
    recommendedApprovalState: normalizeStrategyApprovalState(shape.recommendedApprovalState),
    notes: Array.isArray(shape.notes) ? shape.notes.filter((note): note is string => typeof note === "string") : [],
  };
}

function normalizeStrategyConfig(
  entry: unknown,
  options?: { stripLatestEvaluationSummary?: boolean }
): StrategyConfig | null {
  if (!entry || typeof entry !== "object") return null;

  const shape = entry as Partial<StrategyConfig>;
  if (
    typeof shape.id !== "string" ||
    shape.id.trim().length === 0 ||
    typeof shape.name !== "string" ||
    shape.name.trim().length === 0 ||
    typeof shape.createdAt !== "string" ||
    typeof shape.updatedAt !== "string" ||
    !shape.baseAllocation ||
    !Array.isArray(shape.rules) ||
    !shape.guards ||
    typeof shape.executionMode !== "string" ||
    typeof shape.scheduleInterval !== "string"
  ) {
    return null;
  }

  const version = Number.isInteger(shape.version) && (shape.version ?? 0) > 0 ? (shape.version as number) : 1;

  return {
    ...(shape as StrategyConfig),
    version,
    lineageId: typeof shape.lineageId === "string" && shape.lineageId.trim().length > 0 ? shape.lineageId.trim() : shape.id,
    approvalState: normalizeStrategyApprovalState(shape.approvalState),
    approvalUpdatedAt:
      typeof shape.approvalUpdatedAt === "string" && shape.approvalUpdatedAt.trim().length > 0
        ? shape.approvalUpdatedAt
        : shape.updatedAt,
    approvalNote:
      typeof shape.approvalNote === "string" && shape.approvalNote.trim().length > 0 ? shape.approvalNote.trim() : undefined,
    riskControls: normalizeStrategyRiskControls(shape.riskControls),
    latestEvaluationSummary: options?.stripLatestEvaluationSummary
      ? undefined
      : normalizeStrategyEvaluationSummary(shape.latestEvaluationSummary) ?? undefined,
  };
}

function normalizeStrategyVersionRecord(entry: unknown): StrategyVersionRecord | null {
  if (!entry || typeof entry !== "object") return null;

  const shape = entry as Partial<StrategyVersionRecord>;
  if (
    typeof shape.id !== "string" ||
    typeof shape.strategyId !== "string" ||
    !Number.isInteger(shape.version) ||
    typeof shape.createdAt !== "string" ||
    !shape.strategySnapshot
  ) {
    return null;
  }

  const strategySnapshot = normalizeStrategyConfig(shape.strategySnapshot, { stripLatestEvaluationSummary: true });
  if (!strategySnapshot) return null;

  return {
    id: shape.id,
    strategyId: shape.strategyId,
    version: shape.version as number,
    createdAt: shape.createdAt,
    approvalState: normalizeStrategyApprovalState(shape.approvalState),
    strategySnapshot,
  };
}

function cloneStore(store: StrategyStoreData): StrategyStoreData {
  return {
    strategies: store.strategies.map((strategy) => ({ ...strategy })),
    strategyVersions: store.strategyVersions.map((entry) => ({
      ...entry,
      strategySnapshot: { ...entry.strategySnapshot },
    })),
    strategyEvaluations: store.strategyEvaluations.map((entry) => ({ ...entry })),
    rebalanceAllocationProfiles: store.rebalanceAllocationProfiles.map((profile) => ({
      ...profile,
      allocation: { ...profile.allocation },
      holdings: profile.holdings.map((holding) => ({ ...holding })),
    })),
    strategyRuns: [...store.strategyRuns],
    executionPlans: [...store.executionPlans],
    backtestRuns: [...store.backtestRuns],
    backtestSteps: [...store.backtestSteps],
    demoAccount: {
      ...store.demoAccount,
      holdings: store.demoAccount.holdings.map((holding) => ({ ...holding })),
    },
  };
}

function parseStore(raw: string): StrategyStoreData {
  try {
    const parsed = JSON.parse(raw) as Partial<StrategyStoreData>;
    return {
      strategies: Array.isArray(parsed.strategies)
        ? parsed.strategies
            .map((item) => normalizeStrategyConfig(item))
            .filter((item): item is StrategyConfig => item !== null)
        : [],
      strategyVersions: Array.isArray((parsed as { strategyVersions?: unknown[] }).strategyVersions)
        ? (parsed as { strategyVersions: unknown[] }).strategyVersions
            .map((item) => normalizeStrategyVersionRecord(item))
            .filter((item): item is StrategyVersionRecord => item !== null)
        : [],
      strategyEvaluations: Array.isArray((parsed as { strategyEvaluations?: unknown[] }).strategyEvaluations)
        ? (parsed as { strategyEvaluations: unknown[] }).strategyEvaluations
            .map((item) => normalizeStrategyEvaluationSummary(item))
            .filter((item): item is StrategyCandidateEvaluationSummary => item !== null)
        : [],
      rebalanceAllocationProfiles: Array.isArray((parsed as { rebalanceAllocationProfiles?: unknown[] }).rebalanceAllocationProfiles)
        ? (parsed as { rebalanceAllocationProfiles: unknown[] }).rebalanceAllocationProfiles
            .map((item) => normalizeRebalanceAllocationProfile(item))
            .filter((item): item is RebalanceAllocationProfile => item !== null)
        : [],
      strategyRuns: Array.isArray(parsed.strategyRuns)
        ? parsed.strategyRuns
            .map((item) => normalizeStrategyRun(item as Partial<StrategyRun>))
            .filter((item): item is StrategyRun => item !== null)
        : [],
      executionPlans: Array.isArray(parsed.executionPlans)
        ? parsed.executionPlans
            .map((item) => normalizeExecutionPlan(item as Partial<ExecutionPlan>))
            .filter((item): item is ExecutionPlan => item !== null)
        : [],
      backtestRuns: Array.isArray(parsed.backtestRuns) ? parsed.backtestRuns : [],
      backtestSteps: Array.isArray(parsed.backtestSteps) ? parsed.backtestSteps : [],
      demoAccount: normalizeDemoAccountSettings((parsed as { demoAccount?: unknown }).demoAccount),
    };
  } catch {
    return cloneStore(DEFAULT_STORE);
  }
}

function orderByIsoDescending<T extends { createdAt?: string; updatedAt?: string; startedAt?: string; timestamp?: string }>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const leftTs = left.updatedAt ?? left.createdAt ?? left.startedAt ?? left.timestamp ?? "";
    const rightTs = right.updatedAt ?? right.createdAt ?? right.startedAt ?? right.timestamp ?? "";
    return rightTs.localeCompare(leftTs);
  });
}

function pruneStoreForPersistence(store: StrategyStoreData): StrategyStoreData {
  const recentBacktestRuns = orderByIsoDescending(store.backtestRuns).slice(0, MAX_PERSISTED_BACKTEST_RUNS);
  const recentBacktestRunIds = new Set(recentBacktestRuns.map((run) => run.id));
  const versionEntries = orderByIsoDescending(store.strategyVersions);
  const evaluationEntries = orderByIsoDescending(store.strategyEvaluations);

  const versionCounts = new Map<string, number>();
  const retainedVersions = versionEntries.filter((entry) => {
    const nextCount = (versionCounts.get(entry.strategyId) ?? 0) + 1;
    versionCounts.set(entry.strategyId, nextCount);
    return nextCount <= MAX_PERSISTED_STRATEGY_VERSIONS_PER_STRATEGY;
  });

  const evaluationCounts = new Map<string, number>();
  const retainedEvaluations = evaluationEntries.filter((entry) => {
    const nextCount = (evaluationCounts.get(entry.strategyId) ?? 0) + 1;
    evaluationCounts.set(entry.strategyId, nextCount);
    return nextCount <= MAX_PERSISTED_STRATEGY_EVALUATIONS_PER_STRATEGY;
  });

  return {
    ...store,
    strategyVersions: retainedVersions,
    strategyEvaluations: retainedEvaluations,
    strategyRuns: orderByIsoDescending(store.strategyRuns).slice(0, MAX_PERSISTED_STRATEGY_RUNS),
    executionPlans: orderByIsoDescending(store.executionPlans).slice(0, MAX_PERSISTED_EXECUTION_PLANS),
    backtestRuns: recentBacktestRuns,
    backtestSteps: orderByIsoDescending(
      store.backtestSteps.filter((step) => recentBacktestRunIds.has(step.backtestRunId))
    ).slice(0, MAX_PERSISTED_BACKTEST_STEPS),
  };
}

function buildStrategyVersionRecord(strategy: StrategyConfig): StrategyVersionRecord {
  return {
    id: randomUUID(),
    strategyId: strategy.id,
    version: strategy.version,
    createdAt: strategy.updatedAt,
    approvalState: strategy.approvalState,
    strategySnapshot: {
      ...strategy,
      latestEvaluationSummary: undefined,
    },
  };
}

function ensureStrategyVersionRecorded(store: StrategyStoreData, strategy: StrategyConfig): void {
  const exists = store.strategyVersions.some(
    (entry) => entry.strategyId === strategy.id && entry.version === strategy.version
  );
  if (exists) return;
  store.strategyVersions.push(buildStrategyVersionRecord(strategy));
}

interface StoreRow extends RowDataPacket {
  payload: unknown;
}

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
}

interface AuthUserRow extends UserRow {
  email: string | null;
  password_hash: string | null;
}

function parseStorePayload(payload: unknown): StrategyStoreData {
  if (typeof payload === "string") {
    return parseStore(payload);
  }
  if (Buffer.isBuffer(payload)) {
    return parseStore(payload.toString("utf8"));
  }
  if (payload && typeof payload === "object") {
    try {
      return parseStore(JSON.stringify(payload));
    } catch {
      return cloneStore(DEFAULT_STORE);
    }
  }
  return cloneStore(DEFAULT_STORE);
}

export class StrategyRepository {
  private readonly storePath: string;
  private readonly pool: Pool;
  private readonly offlineStoreDir: string;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private activeUserId: number | null = null;
  private activeUsername: string | null = null;
  private readonly bootstrappedUserIds = new Set<number>();
  private storageMode: StrategyRepositoryStorageMode = "database";
  private databaseAvailable = false;
  private initFailureMessage: string | null = null;

  constructor(customPath?: string) {
    this.storePath = customPath ?? path.join(process.cwd(), "data", "strategy-store.json");
    this.offlineStoreDir = path.join(path.dirname(this.storePath), "strategy-users");
    this.pool = mysql.createPool({
      host: process.env.MYAPP_DB_HOST ?? "localhost",
      port: parsePositiveInteger(process.env.MYAPP_DB_PORT, 3306),
      user: process.env.MYAPP_DB_USER ?? "myapp_user",
      password: process.env.MYAPP_DB_PASSWORD ?? "myapp_pass",
      database: process.env.MYAPP_DB_NAME ?? "myapp",
      waitForConnections: true,
      connectionLimit: parsePositiveInteger(process.env.MYAPP_DB_CONNECTION_LIMIT, 10),
      decimalNumbers: true,
      dateStrings: true,
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.initialize().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    await this.initPromise;
  }

  async getStorageStatus(): Promise<StrategyRepositoryStatus> {
    await this.init();

    if (this.storageMode === "database") {
      return {
        storageMode: "database",
        databaseAvailable: true,
        message: "Database available. Sign in with your username and password.",
      };
    }

    const baseMessage = "Database not available. Sign in with the dummy user below to continue in offline mode.";
    const reason = this.initFailureMessage ? ` (${this.initFailureMessage})` : "";

    return {
      storageMode: "offline",
      databaseAvailable: false,
      message: `${baseMessage}${reason}`,
      dummyCredentials: [
        {
          username: DUMMY_USERS[0].username,
          password: DUMMY_USERS[0].password,
        },
      ],
    };
  }

  async authenticateUser(username: string, password: string): Promise<StrategyRepositorySession> {
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = password.trim();

    if (!normalizedUsername || !normalizedPassword) {
      throw new Error("Username and password are required.");
    }

    await this.init();

    if (this.storageMode === "offline") {
      const dummyUser = DUMMY_USERS_BY_USERNAME.get(normalizedUsername);
      if (!dummyUser || dummyUser.password !== normalizedPassword) {
        throw new Error("Database not available. Use the dummy credentials shown below.");
      }

      this.activeUserId = dummyUser.userId;
      this.activeUsername = dummyUser.username;
      await this.ensureOfflineStore(dummyUser, { allowLegacyImport: dummyUser.username === DEFAULT_ACTIVE_USER });

      return {
        userId: dummyUser.userId,
        username: dummyUser.username,
        storageMode: "offline",
        databaseAvailable: false,
      };
    }

    return this.withConnection(async (conn) => {
      const user = await this.authenticateDatabaseUser(conn, normalizedUsername, normalizedPassword);
      this.activeUserId = user.id;
      this.activeUsername = user.username;
      await this.ensureStoreForUser(conn, user.id, { allowLegacyImport: false });

      return {
        userId: user.id,
        username: user.username,
        storageMode: "database",
        databaseAvailable: true,
      };
    });
  }

  async registerUser(username: string, password: string): Promise<StrategyRepositorySession> {
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = password.trim();

    if (!normalizedUsername || !normalizedPassword) {
      throw new Error("Username and password are required.");
    }

    await this.init();

    if (this.storageMode === "offline") {
      throw new Error("Sign up is unavailable while the database is offline. Use the dummy credentials shown below.");
    }

    return this.withConnection(async (conn) => {
      const user = await this.registerDatabaseUser(conn, normalizedUsername, normalizedPassword);
      this.activeUserId = user.id;
      this.activeUsername = user.username;
      await this.ensureStoreForUser(conn, user.id, { allowLegacyImport: false });

      return {
        userId: user.id,
        username: user.username,
        storageMode: "database",
        databaseAvailable: true,
      };
    });
  }

  private requireActiveUserId(): number {
    if (!this.activeUserId) {
      throw new Error("Strategy repository active user is not initialized.");
    }
    return this.activeUserId;
  }

  private requireActiveUsername(): string {
    if (!this.activeUsername) {
      throw new Error("Strategy repository active username is not initialized.");
    }
    return this.activeUsername;
  }

  private normalizeScope(scope?: StrategyUserScope): StrategyUserScope | undefined {
    if (!scope) return undefined;
    const userId =
      typeof scope.userId === "number" && Number.isInteger(scope.userId) && scope.userId > 0 ? scope.userId : undefined;
    const username = typeof scope.username === "string" ? normalizeUsername(scope.username) : undefined;
    if (!userId && !username) return undefined;
    return { userId, username };
  }

  private async withConnection<T>(handler: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await handler(conn);
    } finally {
      conn.release();
    }
  }

  private async withDatabaseConnection<T>(handler: (conn: PoolConnection) => Promise<T>): Promise<T> {
    await this.init();
    if (this.storageMode !== "database") {
      throw new Error("This operation requires database-backed strategy storage.");
    }
    return this.withConnection(handler);
  }

  private async ensureSchema(conn: PoolConnection): Promise<void> {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS agent_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NULL UNIQUE,
        password_hash VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    try {
      await conn.query(`
        ALTER TABLE agent_users
        ADD COLUMN password_hash VARCHAR(64) NULL AFTER email
      `);
    } catch (error) {
      if (extractErrorCode(error) !== "ER_DUP_FIELDNAME") {
        throw error;
      }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS strategy_user_store (
        user_id INT PRIMARY KEY,
        payload JSON NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_strategy_user_store_user
          FOREIGN KEY (user_id) REFERENCES agent_users(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS historical_candles (
        symbol VARCHAR(32) NOT NULL,
        interval_value VARCHAR(8) NOT NULL,
        open_time BIGINT UNSIGNED NOT NULL,
        open DECIMAL(24, 10) NOT NULL,
        high DECIMAL(24, 10) NOT NULL,
        low DECIMAL(24, 10) NOT NULL,
        close DECIMAL(24, 10) NOT NULL,
        volume DECIMAL(28, 12) NOT NULL,
        close_time BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (symbol, interval_value, open_time),
        KEY idx_historical_candles_symbol_interval_time (symbol, interval_value, open_time),
        KEY idx_historical_candles_symbol_interval_close (symbol, interval_value, close_time)
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS strategy_jobs (
        id CHAR(36) NOT NULL PRIMARY KEY,
        type VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        payload JSON NOT NULL,
        result JSON NULL,
        error TEXT NULL,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        next_run_at DATETIME NOT NULL,
        started_at DATETIME NULL,
        finished_at DATETIME NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        KEY idx_strategy_jobs_status_next_run (status, next_run_at),
        KEY idx_strategy_jobs_created_at (created_at)
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS strategy_alerts (
        id CHAR(36) NOT NULL PRIMARY KEY,
        type VARCHAR(64) NOT NULL,
        severity VARCHAR(16) NOT NULL,
        message TEXT NOT NULL,
        payload JSON NULL,
        created_at DATETIME NOT NULL,
        KEY idx_strategy_alerts_created_at (created_at),
        KEY idx_strategy_alerts_type_created_at (type, created_at)
      ) ENGINE=InnoDB
    `);
  }

  private async seedDummyUsers(conn: PoolConnection): Promise<void> {
    for (const user of DUMMY_USERS) {
      await conn.query(
        `
          INSERT INTO agent_users (username, email, password_hash)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            email = VALUES(email),
            password_hash = CASE
              WHEN agent_users.password_hash IS NULL OR agent_users.password_hash = ''
                THEN VALUES(password_hash)
              ELSE agent_users.password_hash
            END
        `,
        [user.username, user.email, hashPassword(user.password)]
      );
    }
  }

  private async getOrCreateUserByUsername(conn: PoolConnection, username: string): Promise<UserRow> {
    const normalizedUsername = normalizeUsername(username);
    const email = `${normalizedUsername}@myapp.local`;

    await conn.query(
      `
        INSERT INTO agent_users (username, email)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE email = VALUES(email)
      `,
      [normalizedUsername, email]
    );

    const [rows] = await conn.query<UserRow[]>(
      `
        SELECT id, username
        FROM agent_users
        WHERE LOWER(username) = LOWER(?)
        LIMIT 1
      `,
      [normalizedUsername]
    );
    const user = rows[0];
    if (!user) {
      throw new Error(`Unable to resolve strategy repository user ${normalizedUsername}.`);
    }
    return user;
  }

  private async findUserByUsername(conn: PoolConnection, username: string): Promise<AuthUserRow | null> {
    const normalizedUsername = normalizeUsername(username);
    const [rows] = await conn.query<AuthUserRow[]>(
      `
        SELECT id, username, email, password_hash
        FROM agent_users
        WHERE LOWER(username) = LOWER(?)
        LIMIT 1
      `,
      [normalizedUsername]
    );
    return rows[0] ?? null;
  }

  private async authenticateDatabaseUser(
    conn: PoolConnection,
    username: string,
    password: string
  ): Promise<UserRow> {
    const normalizedUsername = normalizeUsername(username);
    const passwordHash = hashPassword(password);
    const existing = await this.findUserByUsername(conn, normalizedUsername);

    if (!existing) {
      throw new Error("Invalid username or password.");
    }

    if (!existing.password_hash) {
      throw new Error("This account has not completed sign up yet.");
    }

    if (existing.password_hash !== passwordHash) {
      throw new Error("Invalid username or password.");
    }

    return existing;
  }

  private async registerDatabaseUser(
    conn: PoolConnection,
    username: string,
    password: string
  ): Promise<UserRow> {
    const normalizedUsername = normalizeUsername(username);
    const passwordHash = hashPassword(password);
    const existing = await this.findUserByUsername(conn, normalizedUsername);

    if (!existing) {
      await conn.query(
        `
          INSERT INTO agent_users (username, email, password_hash)
          VALUES (?, ?, ?)
        `,
        [normalizedUsername, `${normalizedUsername}@myapp.local`, passwordHash]
      );
      const created = await this.findUserByUsername(conn, normalizedUsername);
      if (!created) {
        throw new Error(`Unable to create user ${normalizedUsername}.`);
      }
      return created;
    }

    if (existing.password_hash) {
      throw new Error("That username is already registered. Sign in instead.");
    }

    await conn.query(
      `
        UPDATE agent_users
        SET password_hash = ?
        WHERE id = ?
      `,
      [passwordHash, existing.id]
    );

    const updated = await this.findUserByUsername(conn, normalizedUsername);
    if (!updated) {
      throw new Error(`Unable to initialize user ${normalizedUsername}.`);
    }

    return updated;
  }

  private async resolveActiveUser(conn: PoolConnection): Promise<void> {
    const configuredUserId = Number.parseInt(String(process.env.MYAPP_ACTIVE_USER_ID ?? ""), 10);
    if (Number.isInteger(configuredUserId) && configuredUserId > 0) {
      const [byIdRows] = await conn.query<UserRow[]>(
        `
          SELECT id, username
          FROM agent_users
          WHERE id = ?
          LIMIT 1
        `,
        [configuredUserId]
      );
      const byId = byIdRows[0];
      if (byId) {
        this.activeUserId = byId.id;
        this.activeUsername = byId.username;
        return;
      }
    }

    const configuredUsername = normalizeUsername(process.env.MYAPP_ACTIVE_USER ?? DEFAULT_ACTIVE_USER);
    const user = await this.getOrCreateUserByUsername(conn, configuredUsername);

    this.activeUserId = user.id;
    this.activeUsername = user.username;
  }

  private async ensureStoreForUser(
    conn: PoolConnection,
    userId: number,
    options?: { allowLegacyImport: boolean }
  ): Promise<void> {
    if (this.bootstrappedUserIds.has(userId)) return;

    let store = await this.readStoreForUser(conn, userId);
    if (!store) {
      if (options?.allowLegacyImport) {
        store = (await this.loadLegacyStoreFromDisk()) ?? cloneStore(DEFAULT_STORE);
      } else {
        store = cloneStore(DEFAULT_STORE);
      }
    }

    const nowIso = new Date().toISOString();
    const presetStrategies = buildPresetStrategies(nowIso);
    if (store.strategies.length === 0) {
      store.strategies = presetStrategies.map((strategy) => ({
        ...strategy,
        nextRunAt: createNextRunAt(nowIso, strategy.scheduleInterval),
      }));
    } else {
      const existingById = new Set(store.strategies.map((strategy) => strategy.id));
      const missingPresets = presetStrategies
        .filter((strategy) => !existingById.has(strategy.id))
        .map((strategy) => ({
          ...strategy,
          nextRunAt: createNextRunAt(nowIso, strategy.scheduleInterval),
        }));
      if (missingPresets.length > 0) {
        store.strategies.push(...missingPresets);
      }
    }

    store.strategies = store.strategies
      .map((strategy) => normalizeStrategyConfig(strategy))
      .filter((strategy): strategy is StrategyConfig => strategy !== null);
    store.strategies.forEach((strategy) => ensureStrategyVersionRecorded(store, strategy));
    store.demoAccount = normalizeDemoAccountSettings(store.demoAccount);
    await this.writeStoreForUser(conn, userId, store);
    this.bootstrappedUserIds.add(userId);
  }

  private async resolveUserId(conn: PoolConnection, scope?: StrategyUserScope): Promise<number> {
    const normalizedScope = this.normalizeScope(scope);
    if (!normalizedScope) {
      const userId = this.requireActiveUserId();
      await this.ensureStoreForUser(conn, userId, { allowLegacyImport: true });
      return userId;
    }

    if (normalizedScope.userId) {
      const [rows] = await conn.query<UserRow[]>(
        `
          SELECT id, username
          FROM agent_users
          WHERE id = ?
          LIMIT 1
        `,
        [normalizedScope.userId]
      );
      const user = rows[0];
      if (!user) {
        throw new Error(`User id ${normalizedScope.userId} was not found.`);
      }
      await this.ensureStoreForUser(conn, user.id, { allowLegacyImport: false });
      return user.id;
    }

    const user = await this.getOrCreateUserByUsername(conn, normalizedScope.username ?? DEFAULT_ACTIVE_USER);
    await this.ensureStoreForUser(conn, user.id, { allowLegacyImport: false });
    return user.id;
  }

  private async loadLegacyStoreFromDisk(): Promise<StrategyStoreData | null> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      return parseStore(raw);
    } catch {
      return null;
    }
  }

  private async readStoreForUser(conn: PoolConnection, userId: number): Promise<StrategyStoreData | null> {
    const [rows] = await conn.query<StoreRow[]>(
      `
        SELECT payload
        FROM strategy_user_store
        WHERE user_id = ?
        LIMIT 1
      `,
      [userId]
    );
    const row = rows[0];
    if (!row) return null;
    return parseStorePayload(row.payload);
  }

  private async writeStoreForUser(conn: PoolConnection, userId: number, store: StrategyStoreData): Promise<void> {
    const persistedStore = pruneStoreForPersistence(store);
    await conn.query(
      `
        INSERT INTO strategy_user_store (user_id, payload, updated_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          payload = VALUES(payload),
          updated_at = VALUES(updated_at)
      `,
      [userId, JSON.stringify(persistedStore), new Date().toISOString()]
    );
  }

  private resolveOfflineUser(scope?: StrategyUserScope): (typeof DUMMY_USERS)[number] {
    const normalizedScope = this.normalizeScope(scope);

    if (normalizedScope?.userId) {
      const byId = DUMMY_USERS_BY_ID.get(normalizedScope.userId);
      if (!byId) {
        throw new Error("Database not available. Offline mode supports the dummy user only.");
      }
      return byId;
    }

    if (normalizedScope?.username) {
      const byUsername = DUMMY_USERS_BY_USERNAME.get(normalizedScope.username);
      if (!byUsername) {
        throw new Error("Database not available. Use the dummy credentials shown in the login dialog.");
      }
      return byUsername;
    }

    const activeUsername = this.requireActiveUsername();
    return DUMMY_USERS_BY_USERNAME.get(activeUsername) ?? DUMMY_USERS[0];
  }

  private getOfflineStorePath(username: string): string {
    return path.join(this.offlineStoreDir, `${normalizeUsername(username)}.json`);
  }

  private async readOfflineStore(username: string): Promise<StrategyStoreData | null> {
    try {
      const raw = await readFile(this.getOfflineStorePath(username), "utf8");
      return parseStore(raw);
    } catch {
      return null;
    }
  }

  private async writeOfflineStore(username: string, store: StrategyStoreData): Promise<void> {
    await mkdir(this.offlineStoreDir, { recursive: true });
    await writeFile(this.getOfflineStorePath(username), JSON.stringify(pruneStoreForPersistence(store), null, 2), "utf8");
  }

  private async ensureOfflineStore(
    user: (typeof DUMMY_USERS)[number],
    options?: { allowLegacyImport: boolean }
  ): Promise<void> {
    if (this.bootstrappedUserIds.has(user.userId)) return;

    let store = await this.readOfflineStore(user.username);
    if (!store) {
      if (options?.allowLegacyImport && user.username === DEFAULT_ACTIVE_USER) {
        store = (await this.loadLegacyStoreFromDisk()) ?? cloneStore(DEFAULT_STORE);
      } else {
        store = cloneStore(DEFAULT_STORE);
      }
    }

    const nowIso = new Date().toISOString();
    const presetStrategies = buildPresetStrategies(nowIso);
    if (store.strategies.length === 0) {
      store.strategies = presetStrategies.map((strategy) => ({
        ...strategy,
        nextRunAt: createNextRunAt(nowIso, strategy.scheduleInterval),
      }));
    } else {
      const existingById = new Set(store.strategies.map((strategy) => strategy.id));
      const missingPresets = presetStrategies
        .filter((strategy) => !existingById.has(strategy.id))
        .map((strategy) => ({
          ...strategy,
          nextRunAt: createNextRunAt(nowIso, strategy.scheduleInterval),
        }));
      if (missingPresets.length > 0) {
        store.strategies.push(...missingPresets);
      }
    }

    store.strategies = store.strategies
      .map((strategy) => normalizeStrategyConfig(strategy))
      .filter((strategy): strategy is StrategyConfig => strategy !== null);
    store.strategies.forEach((strategy) => ensureStrategyVersionRecorded(store, strategy));
    store.demoAccount = normalizeDemoAccountSettings(store.demoAccount);
    await this.writeOfflineStore(user.username, store);
    this.bootstrappedUserIds.add(user.userId);
  }

  private async initializeOffline(error: unknown): Promise<void> {
    this.storageMode = "offline";
    this.databaseAvailable = false;
    this.initFailureMessage = formatErrorMessage(error);
    this.activeUserId = DUMMY_USERS[0].userId;
    this.activeUsername = DUMMY_USERS[0].username;
    this.initialized = true;

    for (const user of DUMMY_USERS) {
      await this.ensureOfflineStore(user, { allowLegacyImport: user.username === DEFAULT_ACTIVE_USER });
    }

    for (const scope of await this.listUserScopes()) {
      await this.markInterruptedRunsAsFailed(scope);
      await this.markInterruptedBacktestRunsAsFailed(scope);
    }
  }

  private async initialize(): Promise<void> {
    let retries = 0;

    while (true) {
      try {
        await this.withConnection(async (conn) => {
          await this.ensureSchema(conn);
          await this.seedDummyUsers(conn);
          await this.resolveActiveUser(conn);
          await this.ensureStoreForUser(conn, this.requireActiveUserId(), { allowLegacyImport: true });
        });

        this.storageMode = "database";
        this.databaseAvailable = true;
        this.initFailureMessage = null;
        this.initialized = true;

        const scopes = await this.listUserScopes();
        for (const scope of scopes) {
          await this.markInterruptedRunsAsFailed(scope);
          await this.markInterruptedBacktestRunsAsFailed(scope);
        }
        await this.recoverInterruptedStrategyJobs();
        return;
      } catch (error) {
        if (shouldRetryDatabaseInitialization(error) && (DB_INIT_MAX_RETRIES === 0 || retries < DB_INIT_MAX_RETRIES)) {
          retries += 1;
          this.initFailureMessage = formatErrorMessage(error);
          console.warn(
            `[strategy-repository] Database unavailable during initialization (attempt ${retries}). ` +
              `Retrying in ${DB_INIT_RETRY_INTERVAL_MS}ms: ${this.initFailureMessage}`
          );
          await delay(DB_INIT_RETRY_INTERVAL_MS);
          continue;
        }

        await this.initializeOffline(error);
        return;
      }
    }
  }

  private async readStore(scope?: StrategyUserScope): Promise<StrategyStoreData> {
    if (this.storageMode === "offline") {
      const user = this.resolveOfflineUser(scope);
      await this.ensureOfflineStore(user, { allowLegacyImport: user.username === DEFAULT_ACTIVE_USER });
      return (await this.readOfflineStore(user.username)) ?? cloneStore(DEFAULT_STORE);
    }

    return this.withConnection(async (conn) => {
      const userId = await this.resolveUserId(conn, scope);
      const store = await this.readStoreForUser(conn, userId);
      return store ?? cloneStore(DEFAULT_STORE);
    });
  }

  private async writeStore(store: StrategyStoreData, scope?: StrategyUserScope): Promise<void> {
    if (this.storageMode === "offline") {
      const user = this.resolveOfflineUser(scope);
      await this.ensureOfflineStore(user, { allowLegacyImport: user.username === DEFAULT_ACTIVE_USER });
      await this.writeOfflineStore(user.username, store);
      return;
    }

    await this.withConnection(async (conn) => {
      const userId = await this.resolveUserId(conn, scope);
      await this.writeStoreForUser(conn, userId, store);
    });
  }

  private async readAfterWrites<T>(
    scope: StrategyUserScope | undefined,
    reader: (store: StrategyStoreData) => T | Promise<T>
  ): Promise<T> {
    await this.init();
    await this.writeQueue;
    const store = await this.readStore(scope);
    return reader(store);
  }

  private mutate<T>(
    scope: StrategyUserScope | undefined,
    mutator: (store: StrategyStoreData) => T | Promise<T>
  ): Promise<T> {
    const action = async () => {
      await this.init();
      const store = await this.readStore(scope);
      const result = await mutator(store);
      await this.writeStore(store, scope);
      return result;
    };

    const next = this.writeQueue.then(action, action);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined
    );

    return next;
  }

  async markInterruptedRunsAsFailed(scope?: StrategyUserScope): Promise<void> {
    await this.mutate(scope, (store) => {
      const nowIso = new Date().toISOString();
      store.strategyRuns = store.strategyRuns.map((run) => {
        if (run.status !== "running") return run;
        return {
          ...run,
          status: "failed",
          completedAt: nowIso,
          error: "Interrupted by process restart.",
          warnings: [...run.warnings, "Run interrupted by process restart."],
        };
      });
    });
  }

  async markInterruptedBacktestRunsAsFailed(scope?: StrategyUserScope): Promise<void> {
    await this.mutate(scope, (store) => {
      const nowIso = new Date().toISOString();
      store.backtestRuns = store.backtestRuns.map((run) => {
        if (run.status !== "running" && run.status !== "pending") return run;
        return {
          ...run,
          status: "failed",
          completedAt: nowIso,
          error: "Interrupted by process restart.",
        };
      });
    });
  }

  async listUserScopes(): Promise<StrategyUserScope[]> {
    await this.init();

    if (this.storageMode === "offline") {
      return DUMMY_USERS.map((user) => ({ userId: user.userId, username: user.username }));
    }

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query<UserRow[]>(
        `
          SELECT id, username
          FROM agent_users
          ORDER BY id ASC
        `
      );
      return rows.map((row) => ({ userId: row.id, username: row.username }));
    });
  }

  async listStrategies(scope?: StrategyUserScope): Promise<StrategyConfig[]> {
    return this.readAfterWrites(scope, (store) =>
      orderByIsoDescending(store.strategies)
        .map((strategy) => normalizeStrategyConfig(strategy))
        .filter((strategy): strategy is StrategyConfig => strategy !== null)
    );
  }

  async getStrategy(strategyId: string, scope?: StrategyUserScope): Promise<StrategyConfig | null> {
    return this.readAfterWrites(scope, (store) => {
      const strategy = store.strategies.find((item) => item.id === strategyId);
      return normalizeStrategyConfig(strategy) ?? null;
    });
  }

  async saveStrategy(strategy: StrategyConfig, scope?: StrategyUserScope): Promise<StrategyConfig> {
    return this.mutate(scope, (store) => {
      const normalizedStrategy = normalizeStrategyConfig(strategy);
      if (!normalizedStrategy) {
        throw new Error("Invalid strategy payload.");
      }

      const index = store.strategies.findIndex((item) => item.id === normalizedStrategy.id);
      if (index >= 0) {
        store.strategies[index] = normalizedStrategy;
      } else {
        store.strategies.push(normalizedStrategy);
      }

      ensureStrategyVersionRecorded(store, normalizedStrategy);
      return normalizedStrategy;
    });
  }

  async listStrategyVersions(strategyId: string, scope?: StrategyUserScope): Promise<StrategyVersionRecord[]> {
    return this.readAfterWrites(scope, (store) =>
      orderByIsoDescending(store.strategyVersions)
        .filter((entry) => entry.strategyId === strategyId)
        .map((entry) => ({
          ...entry,
          strategySnapshot: { ...entry.strategySnapshot },
        }))
    );
  }

  async listStrategyEvaluations(
    strategyId: string,
    scope?: StrategyUserScope
  ): Promise<StrategyCandidateEvaluationSummary[]> {
    return this.readAfterWrites(scope, (store) =>
      orderByIsoDescending(store.strategyEvaluations)
        .filter((entry) => entry.strategyId === strategyId)
        .map((entry) => ({ ...entry }))
    );
  }

  async saveStrategyEvaluation(
    evaluation: StrategyCandidateEvaluationSummary,
    scope?: StrategyUserScope
  ): Promise<StrategyCandidateEvaluationSummary> {
    return this.mutate(scope, (store) => {
      const normalizedEvaluation = normalizeStrategyEvaluationSummary(evaluation);
      if (!normalizedEvaluation) {
        throw new Error("Invalid strategy evaluation payload.");
      }

      const index = store.strategyEvaluations.findIndex((entry) => entry.id === normalizedEvaluation.id);
      if (index >= 0) {
        store.strategyEvaluations[index] = normalizedEvaluation;
      } else {
        store.strategyEvaluations.push(normalizedEvaluation);
      }

      const strategy = store.strategies.find((entry) => entry.id === normalizedEvaluation.strategyId);
      if (strategy) {
        strategy.latestEvaluationSummary = normalizedEvaluation;
        strategy.updatedAt = normalizedEvaluation.createdAt;
      }

      return normalizedEvaluation;
    });
  }

  async updateStrategyApprovalState(
    strategyId: string,
    approvalState: StrategyApprovalState,
    approvalNote: string | undefined,
    scope?: StrategyUserScope
  ): Promise<StrategyConfig | null> {
    return this.mutate(scope, (store) => {
      const strategy = store.strategies.find((entry) => entry.id === strategyId);
      if (!strategy) return null;

      const nowIso = new Date().toISOString();
      strategy.approvalState = approvalState;
      strategy.approvalUpdatedAt = nowIso;
      strategy.approvalNote = approvalNote?.trim() ? approvalNote.trim() : undefined;
      strategy.updatedAt = nowIso;
      return normalizeStrategyConfig(strategy);
    });
  }

  async deleteStrategy(strategyId: string, scope?: StrategyUserScope): Promise<boolean> {
    return this.mutate(scope, (store) => {
      const before = store.strategies.length;
      store.strategies = store.strategies.filter((strategy) => strategy.id !== strategyId);
      const removed = store.strategies.length < before;
      if (!removed) {
        return false;
      }

      store.strategyRuns = store.strategyRuns.filter((run) => run.strategyId !== strategyId);
      store.executionPlans = store.executionPlans.filter((plan) => plan.strategyId !== strategyId);
      store.strategyVersions = store.strategyVersions.filter((entry) => entry.strategyId !== strategyId);
      store.strategyEvaluations = store.strategyEvaluations.filter((entry) => entry.strategyId !== strategyId);

      const removedBacktestRunIds = new Set(
        store.backtestRuns.filter((run) => run.strategyId === strategyId).map((run) => run.id)
      );
      store.backtestRuns = store.backtestRuns.filter((run) => run.strategyId !== strategyId);

      store.backtestSteps = store.backtestSteps.filter((step) => !removedBacktestRunIds.has(step.backtestRunId));
      const removedProfileIds = new Set(
        store.rebalanceAllocationProfiles
          .filter((profile) => profile.strategyId === strategyId)
          .map((profile) => profile.id)
      );
      store.rebalanceAllocationProfiles = store.rebalanceAllocationProfiles.filter((profile) => profile.strategyId !== strategyId);
      store.strategyRuns = store.strategyRuns.filter((run) => !removedProfileIds.has(run.rebalanceAllocationId ?? ""));
      store.executionPlans = store.executionPlans.filter((plan) => !removedProfileIds.has(plan.rebalanceAllocationId ?? ""));

      return true;
    });
  }

  async setStrategyEnabled(strategyId: string, isEnabled: boolean, scope?: StrategyUserScope): Promise<StrategyConfig | null> {
    return this.mutate(scope, (store) => {
      const strategy = store.strategies.find((item) => item.id === strategyId);
      if (!strategy) return null;

      const nowIso = new Date().toISOString();
      strategy.isEnabled = isEnabled;
      strategy.updatedAt = nowIso;
      strategy.nextRunAt = isEnabled ? createNextRunAt(nowIso, strategy.scheduleInterval) : undefined;
      return strategy;
    });
  }

  async scheduleStrategy(
    strategyId: string,
    scheduleInterval: string,
    scope?: StrategyUserScope
  ): Promise<StrategyConfig | null> {
    return this.mutate(scope, (store) => {
      const strategy = store.strategies.find((item) => item.id === strategyId);
      if (!strategy) return null;

      const nowIso = new Date().toISOString();
      strategy.scheduleInterval = scheduleInterval;
      strategy.updatedAt = nowIso;
      strategy.nextRunAt = createNextRunAt(nowIso, scheduleInterval);
      return strategy;
    });
  }

  async updateStrategyRunTimestamps(strategyId: string, completedAtIso: string, scope?: StrategyUserScope): Promise<void> {
    await this.mutate(scope, (store) => {
      const strategy = store.strategies.find((item) => item.id === strategyId);
      if (!strategy) return;

      strategy.lastRunAt = completedAtIso;
      strategy.nextRunAt = createNextRunAt(completedAtIso, strategy.scheduleInterval);
      strategy.updatedAt = completedAtIso;
    });
  }

  async listDueStrategies(nowIso: string, scope?: StrategyUserScope): Promise<StrategyConfig[]> {
    return this.readAfterWrites(scope, (store) =>
      store.strategies
        .filter((strategy) => {
          if (!strategy.isEnabled) return false;
          if (strategy.executionMode === "manual") return false;
          if (!strategy.nextRunAt) return true;
          return strategy.nextRunAt <= nowIso;
        })
        .sort((left, right) => {
          const leftRun = left.nextRunAt ?? "";
          const rightRun = right.nextRunAt ?? "";
          return leftRun.localeCompare(rightRun);
        })
    );
  }

  async listRebalanceAllocationProfiles(scope?: StrategyUserScope): Promise<RebalanceAllocationProfile[]> {
    return this.readAfterWrites(scope, (store) =>
      orderByIsoDescending(store.rebalanceAllocationProfiles).map((profile) => ({
        ...profile,
        allocation: { ...profile.allocation },
        holdings: profile.holdings.map((holding) => ({ ...holding })),
      }))
    );
  }

  async getRebalanceAllocationProfile(profileId: string, scope?: StrategyUserScope): Promise<RebalanceAllocationProfile | null> {
    return this.readAfterWrites(scope, (store) => {
      const profile = store.rebalanceAllocationProfiles.find((item) => item.id === profileId);
      if (!profile) return null;
      return {
        ...profile,
        allocation: { ...profile.allocation },
        holdings: profile.holdings.map((holding) => ({ ...holding })),
      };
    });
  }

  async saveRebalanceAllocationProfile(
    profile: RebalanceAllocationProfile,
    scope?: StrategyUserScope
  ): Promise<RebalanceAllocationProfile> {
    return this.mutate(scope, (store) => {
      const nextProfile = normalizeRebalanceAllocationProfile(profile);
      if (!nextProfile) {
        throw new Error("Invalid rebalance allocation profile.");
      }

      const index = store.rebalanceAllocationProfiles.findIndex((item) => item.id === nextProfile.id);
      if (index >= 0) {
        store.rebalanceAllocationProfiles[index] = nextProfile;
      } else {
        store.rebalanceAllocationProfiles.push(nextProfile);
      }

      return {
        ...nextProfile,
        allocation: { ...nextProfile.allocation },
        holdings: nextProfile.holdings.map((holding) => ({ ...holding })),
      };
    });
  }

  async deleteRebalanceAllocationProfile(profileId: string, scope?: StrategyUserScope): Promise<boolean> {
    return this.mutate(scope, (store) => {
      const before = store.rebalanceAllocationProfiles.length;
      store.rebalanceAllocationProfiles = store.rebalanceAllocationProfiles.filter((profile) => profile.id !== profileId);
      const removed = store.rebalanceAllocationProfiles.length < before;
      if (!removed) {
        return false;
      }

      store.strategyRuns = store.strategyRuns.filter((run) => run.rebalanceAllocationId !== profileId);
      store.executionPlans = store.executionPlans.filter((plan) => plan.rebalanceAllocationId !== profileId);
      return true;
    });
  }

  async listRebalanceAllocationProfilesByStrategy(
    strategyId: string,
    scope?: StrategyUserScope
  ): Promise<RebalanceAllocationProfile[]> {
    return this.readAfterWrites(scope, (store) =>
      orderByIsoDescending(store.rebalanceAllocationProfiles)
        .filter((profile) => profile.strategyId === strategyId)
        .map((profile) => ({
          ...profile,
          allocation: { ...profile.allocation },
          holdings: profile.holdings.map((holding) => ({ ...holding })),
        }))
    );
  }

  async listDueRebalanceAllocationProfiles(nowIso: string, scope?: StrategyUserScope): Promise<RebalanceAllocationProfile[]> {
    return this.readAfterWrites(scope, (store) =>
      orderByIsoDescending(store.rebalanceAllocationProfiles)
        .filter((profile) => {
          if (!profile.isEnabled) return false;
          if (profile.executionPolicy !== "interval") return false;
          if (!profile.nextExecutionAt) return true;
          return profile.nextExecutionAt <= nowIso;
        })
        .map((profile) => ({
          ...profile,
          allocation: { ...profile.allocation },
          holdings: profile.holdings.map((holding) => ({ ...holding })),
        }))
    );
  }

  async markRebalanceAllocationProfileEvaluated(
    profileId: string,
    evaluatedAtIso: string,
    scope?: StrategyUserScope
  ): Promise<RebalanceAllocationProfile | null> {
    return this.mutate(scope, (store) => {
      const profile = store.rebalanceAllocationProfiles.find((item) => item.id === profileId);
      if (!profile) return null;
      profile.lastEvaluatedAt = evaluatedAtIso;
      profile.updatedAt = evaluatedAtIso;
      if (profile.executionPolicy === "interval" && profile.scheduleInterval) {
        profile.nextExecutionAt = createNextRunAt(evaluatedAtIso, profile.scheduleInterval);
      }
      return {
        ...profile,
        allocation: { ...profile.allocation },
        holdings: profile.holdings.map((holding) => ({ ...holding })),
      };
    });
  }

  async applyRebalanceAllocationProfileExecution(
    profileId: string,
    holdings: DemoAccountHolding[],
    executedAtIso: string,
    scope?: StrategyUserScope
  ): Promise<RebalanceAllocationProfile | null> {
    return this.mutate(scope, (store) => {
      const profile = store.rebalanceAllocationProfiles.find((item) => item.id === profileId);
      if (!profile) return null;

      profile.holdings = holdings
        .map((holding) => normalizeDemoAccountHolding(holding))
        .filter((holding): holding is DemoAccountHolding => holding !== null);
      profile.lastEvaluatedAt = executedAtIso;
      profile.lastExecutedAt = executedAtIso;
      profile.updatedAt = executedAtIso;
      if (profile.executionPolicy === "interval" && profile.scheduleInterval) {
        profile.nextExecutionAt = createNextRunAt(executedAtIso, profile.scheduleInterval);
      }

      return {
        ...profile,
        allocation: { ...profile.allocation },
        holdings: profile.holdings.map((holding) => ({ ...holding })),
      };
    });
  }

  async getDemoAccountSettings(scope?: StrategyUserScope): Promise<DemoAccountSettings> {
    return this.readAfterWrites(scope, (store) => ({
      ...store.demoAccount,
      holdings: store.demoAccount.holdings.map((holding) => ({ ...holding })),
    }));
  }

  async setDemoAccountBalance(balance: number, scope?: StrategyUserScope): Promise<DemoAccountSettings> {
    return this.mutate(scope, (store) => {
      const safeBalance = Number.isFinite(balance) && balance > 0 ? balance : store.demoAccount.balance;
      store.demoAccount = {
        balance: safeBalance,
        updatedAt: new Date().toISOString(),
        holdings: [],
      };
      return {
        ...store.demoAccount,
        holdings: [],
      };
    });
  }

  async initializeDemoAccount(
    balance: number,
    holdings: DemoAccountHolding[],
    scope?: StrategyUserScope
  ): Promise<DemoAccountSettings> {
    return this.mutate(scope, (store) => {
      const safeBalance =
        Number.isFinite(balance) && balance > 0 ? balance : createDefaultDemoAccountSettings().balance;
      const normalizedHoldings = holdings
        .map((holding) => normalizeDemoAccountHolding(holding))
        .filter((holding): holding is DemoAccountHolding => holding !== null);
      const timestamp = new Date().toISOString();
      store.demoAccount = {
        balance: safeBalance,
        updatedAt: timestamp,
        seededAt: timestamp,
        holdings: normalizedHoldings,
      };
      return {
        ...store.demoAccount,
        holdings: normalizedHoldings.map((holding) => ({ ...holding })),
      };
    });
  }

  async setDemoAccountHoldings(holdings: DemoAccountHolding[], scope?: StrategyUserScope): Promise<DemoAccountSettings> {
    return this.mutate(scope, (store) => {
      const normalizedHoldings = holdings
        .map((holding) => normalizeDemoAccountHolding(holding))
        .filter((holding): holding is DemoAccountHolding => holding !== null);
      const timestamp = new Date().toISOString();
      store.demoAccount = {
        ...store.demoAccount,
        updatedAt: timestamp,
        holdings: normalizedHoldings,
      };
      return {
        ...store.demoAccount,
        holdings: normalizedHoldings.map((holding) => ({ ...holding })),
      };
    });
  }

  async resetDemoAccount(scope?: StrategyUserScope): Promise<DemoAccountSettings> {
    return this.mutate(scope, (store) => {
      const defaultSettings = createDefaultDemoAccountSettings();
      const timestamp = new Date().toISOString();
      store.demoAccount = {
        ...defaultSettings,
        updatedAt: timestamp,
      };
      return {
        ...store.demoAccount,
        holdings: [],
      };
    });
  }

  async createStrategyRun(input: {
    strategyId: string;
    rebalanceAllocationId?: string;
    rebalanceAllocationName?: string;
    status: StrategyRunStatus;
    accountType: StrategyRun["accountType"];
    mode: StrategyRun["mode"];
    trigger: StrategyRun["trigger"];
    inputSnapshot?: StrategyRun["inputSnapshot"];
    warnings?: string[];
    marketGate?: StrategyRun["marketGate"];
    skipReason?: string;
    error?: string;
  }, scope?: StrategyUserScope): Promise<StrategyRun> {
    return this.mutate(scope, (store) => {
      const run: StrategyRun = {
        id: randomUUID(),
        strategyId: input.strategyId,
        rebalanceAllocationId: input.rebalanceAllocationId,
        rebalanceAllocationName: input.rebalanceAllocationName,
        startedAt: new Date().toISOString(),
        status: input.status,
        accountType: input.accountType,
        mode: input.mode,
        trigger: input.trigger,
        inputSnapshot: input.inputSnapshot,
        warnings: input.warnings ?? [],
        marketGate: input.marketGate,
        skipReason: input.skipReason,
        error: input.error,
      };

      store.strategyRuns.push(run);
      return run;
    });
  }

  async updateStrategyRun(runId: string, patch: Partial<StrategyRun>, scope?: StrategyUserScope): Promise<StrategyRun | null> {
    return this.mutate(scope, (store) => {
      const run = store.strategyRuns.find((item) => item.id === runId);
      if (!run) return null;

      Object.assign(run, patch);
      return run;
    });
  }

  async listStrategyRuns(
    limit = 200,
    accountType?: StrategyRun["accountType"],
    scope?: StrategyUserScope
  ): Promise<StrategyRun[]> {
    return this.readAfterWrites(scope, (store) =>
      orderByIsoDescending(store.strategyRuns)
        .filter((run) => (accountType ? run.accountType === accountType : true))
        .slice(0, limit)
    );
  }

  async getStrategyRun(runId: string, scope?: StrategyUserScope): Promise<StrategyRun | null> {
    return this.readAfterWrites(scope, (store) => store.strategyRuns.find((run) => run.id === runId) ?? null);
  }

  async saveExecutionPlan(plan: ExecutionPlan, scope?: StrategyUserScope): Promise<ExecutionPlan> {
    return this.mutate(scope, (store) => {
      const index = store.executionPlans.findIndex((item) => item.id === plan.id);
      if (index >= 0) {
        store.executionPlans[index] = plan;
      } else {
        store.executionPlans.push(plan);
      }

      return plan;
    });
  }

  async getExecutionPlan(planId: string, scope?: StrategyUserScope): Promise<ExecutionPlan | null> {
    return this.readAfterWrites(scope, (store) => store.executionPlans.find((item) => item.id === planId) ?? null);
  }

  async getLatestExecutionPlanByStrategy(
    strategyId: string,
    accountType?: ExecutionPlan["accountType"],
    scope?: StrategyUserScope
  ): Promise<ExecutionPlan | null> {
    return this.readAfterWrites(scope, (store) => {
      const plans = store.executionPlans
        .filter((plan) => plan.strategyId === strategyId && (accountType ? plan.accountType === accountType : true))
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
      return plans[0] ?? null;
    });
  }

  async createBacktestRun(input: {
    strategyId: string;
    startDate: string;
    endDate: string;
    initialCapital: number;
    status?: BacktestRunStatus;
  }, scope?: StrategyUserScope): Promise<BacktestRun> {
    return this.mutate(scope, (store) => {
      const run: BacktestRun = {
        id: randomUUID(),
        strategyId: input.strategyId,
        startDate: input.startDate,
        endDate: input.endDate,
        initialCapital: input.initialCapital,
        status: input.status ?? "pending",
        createdAt: new Date().toISOString(),
      };

      store.backtestRuns.push(run);
      return run;
    });
  }

  async updateBacktestRun(runId: string, patch: Partial<BacktestRun>, scope?: StrategyUserScope): Promise<BacktestRun | null> {
    return this.mutate(scope, (store) => {
      const run = store.backtestRuns.find((item) => item.id === runId);
      if (!run) return null;

      Object.assign(run, patch);
      return run;
    });
  }

  async listBacktestRuns(limit = 100, scope?: StrategyUserScope): Promise<BacktestRun[]> {
    return this.readAfterWrites(scope, (store) => orderByIsoDescending(store.backtestRuns).slice(0, limit));
  }

  async getBacktestRun(runId: string, scope?: StrategyUserScope): Promise<BacktestRun | null> {
    return this.readAfterWrites(scope, (store) => store.backtestRuns.find((item) => item.id === runId) ?? null);
  }

  async appendBacktestSteps(steps: BacktestStep[], scope?: StrategyUserScope): Promise<void> {
    if (steps.length === 0) return;

    await this.mutate(scope, (store) => {
      store.backtestSteps.push(...steps);
    });
  }

  async listBacktestSteps(backtestRunId: string, scope?: StrategyUserScope): Promise<BacktestStep[]> {
    return this.readAfterWrites(scope, (store) =>
      store.backtestSteps
        .filter((step) => step.backtestRunId === backtestRunId)
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    );
  }

  async listHistoricalCandles(
    symbol: string,
    interval: HistoricalCandle["interval"],
    startTime: number,
    endTime: number
  ): Promise<HistoricalCandle[]> {
    return this.withDatabaseConnection(async (conn) => {
      const [rows] = await conn.query<HistoricalCandleRow[]>(
        `
          SELECT symbol, interval_value, open_time, open, high, low, close, volume, close_time
          FROM historical_candles
          WHERE symbol = ?
            AND interval_value = ?
            AND open_time BETWEEN ? AND ?
          ORDER BY open_time ASC
        `,
        [symbol.trim().toUpperCase(), interval, startTime, endTime]
      );

      return rows
        .map((row) =>
          normalizeHistoricalCandle({
            symbol: row.symbol,
            interval: row.interval_value,
            openTime: Number(row.open_time),
            open: Number(row.open),
            high: Number(row.high),
            low: Number(row.low),
            close: Number(row.close),
            volume: Number(row.volume),
            closeTime: Number(row.close_time),
          })
        )
        .filter((entry): entry is HistoricalCandle => entry !== null);
    });
  }

  async saveHistoricalCandles(candles: HistoricalCandle[]): Promise<number> {
    const normalizedCandles = candles
      .map((entry) => normalizeHistoricalCandle(entry))
      .filter((entry): entry is HistoricalCandle => entry !== null);

    if (normalizedCandles.length === 0) {
      return 0;
    }

    return this.withDatabaseConnection(async (conn) => {
      let written = 0;

      for (const batch of chunkArray(normalizedCandles, 250)) {
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const params = batch.flatMap((candle) => [
          candle.symbol,
          candle.interval,
          candle.openTime,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
          candle.closeTime,
        ]);

        const [result] = await conn.query<ResultSetHeader>(
          `
            INSERT INTO historical_candles (
              symbol, interval_value, open_time, open, high, low, close, volume, close_time
            )
            VALUES ${placeholders}
            ON DUPLICATE KEY UPDATE
              open = VALUES(open),
              high = VALUES(high),
              low = VALUES(low),
              close = VALUES(close),
              volume = VALUES(volume),
              close_time = VALUES(close_time)
          `,
          params
        );

        written += result.affectedRows;
      }

      return written;
    });
  }

  async pruneHistoricalCandles(retentionBeforeTime: number): Promise<number> {
    return this.withDatabaseConnection(async (conn) => {
      const [result] = await conn.query<ResultSetHeader>(
        `
          DELETE FROM historical_candles
          WHERE open_time < ?
        `,
        [retentionBeforeTime]
      );
      return result.affectedRows;
    });
  }

  async createStrategyJob(input: {
    type: StrategyJobType;
    payload: Record<string, unknown>;
    maxAttempts?: number;
    nextRunAt?: string;
  }): Promise<StrategyJob> {
    const nowIso = new Date().toISOString();
    const job = normalizeStrategyJob({
      id: randomUUID(),
      type: input.type,
      status: "pending",
      payload: input.payload,
      attempts: 0,
      maxAttempts:
        typeof input.maxAttempts === "number" && Number.isInteger(input.maxAttempts) && input.maxAttempts > 0
          ? input.maxAttempts
          : 3,
      nextRunAt: input.nextRunAt ?? nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    if (!job) {
      throw new Error("Invalid strategy job payload.");
    }

    return this.withDatabaseConnection(async (conn) => {
      await conn.query(
        `
          INSERT INTO strategy_jobs (
            id, type, status, payload, result, error, attempts, max_attempts,
            next_run_at, started_at, finished_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, NULL, ?, ?)
        `,
        [
          job.id,
          job.type,
          job.status,
          JSON.stringify(job.payload),
          job.attempts,
          job.maxAttempts,
          toSqlDateTime(job.nextRunAt),
          toSqlDateTime(job.createdAt),
          toSqlDateTime(job.updatedAt),
        ]
      );

      return job;
    });
  }

  async getStrategyJob(jobId: string, scope?: StrategyUserScope): Promise<StrategyJob | null> {
    const normalizedScope = this.normalizeScope(scope);

    return this.withDatabaseConnection(async (conn) => {
      const conditions = ["id = ?"];
      const params: unknown[] = [jobId];

      if (normalizedScope?.userId) {
        conditions.push("JSON_EXTRACT(payload, '$.userScope.userId') = ?");
        params.push(normalizedScope.userId);
      } else if (normalizedScope?.username) {
        conditions.push("LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.userScope.username'))) = ?");
        params.push(normalizedScope.username);
      }

      const [rows] = await conn.query<StrategyJobRow[]>(
        `
          SELECT id, type, status, payload, result, error, attempts, max_attempts, next_run_at, started_at,
                 finished_at, created_at, updated_at
          FROM strategy_jobs
          WHERE ${conditions.join(" AND ")}
          LIMIT 1
        `,
        params
      );

      const row = rows[0];
      if (!row) {
        return null;
      }

      return normalizeStrategyJob({
        id: row.id,
        type: row.type,
        status: row.status,
        payload: parseJsonField<Record<string, unknown>>(row.payload, {}),
        result: parseJsonField<Record<string, unknown> | undefined>(row.result, undefined),
        error: row.error ?? undefined,
        attempts: Number(row.attempts),
        maxAttempts: Number(row.max_attempts),
        nextRunAt: fromSqlDateTime(row.next_run_at),
        startedAt: fromSqlDateTime(row.started_at),
        finishedAt: fromSqlDateTime(row.finished_at),
        createdAt: fromSqlDateTime(row.created_at),
        updatedAt: fromSqlDateTime(row.updated_at),
      });
    });
  }

  async listStrategyJobs(
    options?: {
      limit?: number;
      strategyId?: string;
      type?: StrategyJobType;
      status?: StrategyJobStatus;
    },
    scope?: StrategyUserScope
  ): Promise<StrategyJob[]> {
    const normalizedScope = this.normalizeScope(scope);
    const limit =
      typeof options?.limit === "number" && Number.isInteger(options.limit) && options.limit > 0
        ? Math.min(options.limit, 100)
        : 25;

    return this.withDatabaseConnection(async (conn) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (normalizedScope?.userId) {
        conditions.push("JSON_EXTRACT(payload, '$.userScope.userId') = ?");
        params.push(normalizedScope.userId);
      } else if (normalizedScope?.username) {
        conditions.push("LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.userScope.username'))) = ?");
        params.push(normalizedScope.username);
      }

      if (options?.strategyId) {
        conditions.push("JSON_UNQUOTE(JSON_EXTRACT(payload, '$.strategyId')) = ?");
        params.push(options.strategyId);
      }

      if (options?.type) {
        conditions.push("type = ?");
        params.push(options.type);
      }

      if (options?.status) {
        conditions.push("status = ?");
        params.push(options.status);
      }

      const [rows] = await conn.query<StrategyJobRow[]>(
        `
          SELECT id, type, status, payload, result, error, attempts, max_attempts, next_run_at, started_at,
                 finished_at, created_at, updated_at
          FROM strategy_jobs
          ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY created_at DESC
          LIMIT ?
        `,
        [...params, limit]
      );

      return rows
        .map((row) =>
          normalizeStrategyJob({
            id: row.id,
            type: row.type,
            status: row.status,
            payload: parseJsonField<Record<string, unknown>>(row.payload, {}),
            result: parseJsonField<Record<string, unknown> | undefined>(row.result, undefined),
            error: row.error ?? undefined,
            attempts: Number(row.attempts),
            maxAttempts: Number(row.max_attempts),
            nextRunAt: fromSqlDateTime(row.next_run_at),
            startedAt: fromSqlDateTime(row.started_at),
            finishedAt: fromSqlDateTime(row.finished_at),
            createdAt: fromSqlDateTime(row.created_at),
            updatedAt: fromSqlDateTime(row.updated_at),
          })
        )
        .filter((entry): entry is StrategyJob => entry !== null);
    });
  }

  async claimDueStrategyJobs(nowIso: string, limit = 1): Promise<StrategyJob[]> {
    return this.withDatabaseConnection(async (conn) => {
      await conn.beginTransaction();

      try {
        const [rows] = await conn.query<StrategyJobRow[]>(
          `
            SELECT id, type, status, payload, result, error, attempts, max_attempts, next_run_at, started_at,
                   finished_at, created_at, updated_at
            FROM strategy_jobs
            WHERE status = 'pending'
              AND next_run_at <= ?
            ORDER BY next_run_at ASC, created_at ASC
            LIMIT ?
            FOR UPDATE
          `,
          [toSqlDateTime(nowIso), Math.max(1, limit)]
        );

        if (rows.length === 0) {
          await conn.commit();
          return [];
        }

        const jobIds = rows.map((row) => row.id);
        const updateTime = toSqlDateTime(nowIso);
        const placeholders = jobIds.map(() => "?").join(", ");

        await conn.query(
          `
            UPDATE strategy_jobs
            SET status = 'running',
                attempts = attempts + 1,
                started_at = ?,
                finished_at = NULL,
                error = NULL,
                updated_at = ?
            WHERE id IN (${placeholders})
          `,
          [updateTime, updateTime, ...jobIds]
        );

        await conn.commit();

        return rows
          .map((row) =>
            normalizeStrategyJob({
              id: row.id,
              type: row.type,
              status: "running",
              payload: parseJsonField<Record<string, unknown>>(row.payload, {}),
              result: parseJsonField<Record<string, unknown> | undefined>(row.result, undefined),
              attempts: Number(row.attempts) + 1,
              maxAttempts: Number(row.max_attempts),
              nextRunAt: fromSqlDateTime(row.next_run_at),
              startedAt: fromSqlDateTime(updateTime),
              finishedAt: undefined,
              createdAt: fromSqlDateTime(row.created_at),
              updatedAt: fromSqlDateTime(updateTime),
            })
          )
          .filter((entry): entry is StrategyJob => entry !== null);
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    });
  }

  async completeStrategyJob(jobId: string, result: Record<string, unknown>): Promise<StrategyJob | null> {
    return this.withDatabaseConnection(async (conn) => {
      const completedAt = new Date().toISOString();
      await conn.query(
        `
          UPDATE strategy_jobs
          SET status = 'completed',
              result = ?,
              error = NULL,
              finished_at = ?,
              updated_at = ?
          WHERE id = ?
        `,
        [JSON.stringify(result), toSqlDateTime(completedAt), toSqlDateTime(completedAt), jobId]
      );

      return this.getStrategyJob(jobId);
    });
  }

  async rescheduleStrategyJob(jobId: string, errorMessage: string, nextRunAt: string): Promise<StrategyJob | null> {
    return this.withDatabaseConnection(async (conn) => {
      const updatedAt = new Date().toISOString();
      await conn.query(
        `
          UPDATE strategy_jobs
          SET status = 'pending',
              error = ?,
              next_run_at = ?,
              started_at = NULL,
              finished_at = NULL,
              updated_at = ?
          WHERE id = ?
        `,
        [errorMessage, toSqlDateTime(nextRunAt), toSqlDateTime(updatedAt), jobId]
      );

      return this.getStrategyJob(jobId);
    });
  }

  async failStrategyJob(jobId: string, errorMessage: string): Promise<StrategyJob | null> {
    return this.withDatabaseConnection(async (conn) => {
      const finishedAt = new Date().toISOString();
      await conn.query(
        `
          UPDATE strategy_jobs
          SET status = 'failed',
              error = ?,
              finished_at = ?,
              updated_at = ?
          WHERE id = ?
        `,
        [errorMessage, toSqlDateTime(finishedAt), toSqlDateTime(finishedAt), jobId]
      );

      return this.getStrategyJob(jobId);
    });
  }

  async recoverInterruptedStrategyJobs(): Promise<number> {
    return this.withDatabaseConnection(async (conn) => {
      const recoveryTime = new Date().toISOString();
      const [result] = await conn.query<ResultSetHeader>(
        `
          UPDATE strategy_jobs
          SET status = 'pending',
              next_run_at = ?,
              started_at = NULL,
              finished_at = NULL,
              error = CASE
                WHEN error IS NULL OR error = '' THEN 'Interrupted by process restart.'
                ELSE CONCAT(error, ' | Interrupted by process restart.')
              END,
              updated_at = ?
          WHERE status = 'running'
        `,
        [toSqlDateTime(recoveryTime), toSqlDateTime(recoveryTime)]
      );

      return result.affectedRows;
    });
  }

  async createAlert(input: {
    type: StrategyAlertType;
    severity: StrategyAlert["severity"];
    message: string;
    payload?: Record<string, unknown>;
  }): Promise<StrategyAlert> {
    const alert = normalizeStrategyAlert({
      id: randomUUID(),
      type: input.type,
      severity: input.severity,
      message: input.message,
      payload: input.payload,
      createdAt: new Date().toISOString(),
    });

    if (!alert) {
      throw new Error("Invalid alert payload.");
    }

    return this.withDatabaseConnection(async (conn) => {
      await conn.query(
        `
          INSERT INTO strategy_alerts (id, type, severity, message, payload, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          alert.id,
          alert.type,
          alert.severity,
          alert.message,
          alert.payload ? JSON.stringify(alert.payload) : null,
          toSqlDateTime(alert.createdAt),
        ]
      );

      return alert;
    });
  }

  async listAlerts(limit = 50): Promise<StrategyAlert[]> {
    return this.withDatabaseConnection(async (conn) => {
      const [rows] = await conn.query<StrategyAlertRow[]>(
        `
          SELECT id, type, severity, message, payload, created_at
          FROM strategy_alerts
          ORDER BY created_at DESC
          LIMIT ?
        `,
        [Math.max(1, Math.min(limit, 100))]
      );

      return rows
        .map((row) =>
          normalizeStrategyAlert({
            id: row.id,
            type: row.type,
            severity: row.severity,
            message: row.message,
            payload: parseJsonField<Record<string, unknown> | undefined>(row.payload, undefined),
            createdAt: fromSqlDateTime(row.created_at),
          })
        )
        .filter((entry): entry is StrategyAlert => entry !== null);
    });
  }
}
