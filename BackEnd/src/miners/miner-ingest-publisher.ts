import type { MinerEntity, MinerReadResult } from "./types.js";

export interface MinerIngestSnapshot {
  name: string;
  ip: string;
  isEnabled: boolean;
  model?: string | null;
  firmware?: string | null;
  currentPreset?: string | null;
  lastSeenAt?: string | null;
  error?: string | null;
  statusPayload?: unknown;
  perfSummaryPayload?: unknown;
  summaryPayload?: unknown;
  infoPayload?: unknown;
  chipsPayload?: unknown;
  cgminerSummary?: unknown;
  cgminerStats?: unknown;
  cgminerDevs?: unknown[];
  cgminerPools?: unknown[];
}

function parseTextResponse(rawText: string): unknown {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function resolveMessage(status: number, payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.detail;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }

  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  return `${fallback} (status ${status}).`;
}

export class MinerIngestPublisher {
  private readonly ingestUrl = (process.env.MINER_INGEST_URL ?? "").trim();
  private readonly ingestToken = (process.env.MINER_INGEST_TOKEN ?? "").trim();
  private readonly source = (process.env.MINER_PUSH_SOURCE ?? "pi").trim() || "pi";
  private readonly timeoutMs: number;

  constructor() {
    const rawTimeoutMs = Number(process.env.MINER_PUSH_TIMEOUT_MS ?? 8_000);
    this.timeoutMs = Number.isFinite(rawTimeoutMs) && rawTimeoutMs >= 1_000 ? rawTimeoutMs : 8_000;
  }

  isEnabled(): boolean {
    return this.ingestUrl.length > 0 && this.ingestToken.length > 0;
  }

  createSnapshotFromRead(miner: MinerEntity, readResult: MinerReadResult): MinerIngestSnapshot {
    return {
      name: miner.name,
      ip: miner.ip,
      isEnabled: miner.isEnabled,
      model: miner.model,
      firmware: miner.firmware,
      currentPreset: readResult.liveData.presetName ?? miner.currentPreset,
      lastSeenAt: readResult.liveData.lastSeenAt ?? new Date().toISOString(),
      error: null,
      statusPayload: readResult.statusPayload,
      perfSummaryPayload: readResult.perfSummaryPayload,
      summaryPayload: readResult.summaryPayload,
      infoPayload: readResult.infoPayload,
      chipsPayload: readResult.chipsPayload,
      cgminerSummary: readResult.cgminerSummary,
      cgminerStats: readResult.cgminerStats,
      cgminerDevs: readResult.cgminerDevs,
      cgminerPools: readResult.cgminerPools,
    };
  }

  createFailureSnapshot(miner: MinerEntity, errorMessage: string): MinerIngestSnapshot {
    return {
      name: miner.name,
      ip: miner.ip,
      isEnabled: miner.isEnabled,
      model: miner.model,
      firmware: miner.firmware,
      currentPreset: miner.currentPreset,
      lastSeenAt: miner.lastSeenAt,
      error: errorMessage,
    };
  }

  async publishSnapshots(miners: MinerIngestSnapshot[]): Promise<void> {
    if (!this.isEnabled() || miners.length === 0) {
      return;
    }

    const response = await fetch(this.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${this.ingestToken}`,
      },
      body: JSON.stringify({
        source: this.source,
        miners,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.ok) {
      return;
    }

    const rawText = await response.text();
    const payload = parseTextResponse(rawText);
    throw new Error(resolveMessage(response.status, payload, "Fleet ingest failed"));
  }
}
