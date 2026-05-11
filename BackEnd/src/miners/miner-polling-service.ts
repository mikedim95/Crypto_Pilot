import { liveDataToSnapshotRaw, normalizePoolsForStorage, normalizePresetOptions } from "./miner-normalizer.js";
import { MinerCommandService } from "./miner-command-service.js";
import { MinerIngestPublisher, type MinerIngestSnapshot } from "./miner-ingest-publisher.js";
import { MinerReadService } from "./miner-read-service.js";
import { MinerRepository } from "./miner-repository.js";
import type { MinerEntity, MinerPresetOption, MinerReadResult } from "./types.js";

const TEMP_CONTROL_COOLDOWN_MS = (() => {
  const parsed = Number(process.env.MINER_TEMP_CONTROL_COOLDOWN_MS ?? 120_000);
  if (!Number.isFinite(parsed) || parsed < 15_000) {
    return 120_000;
  }
  return Math.round(parsed);
})();

const MINER_READ_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.MINER_READ_TIMEOUT_MS ?? 20_000);
  if (!Number.isFinite(parsed) || parsed < 5_000) {
    return 20_000;
  }
  return Math.round(parsed);
})();

const SNAPSHOT_RETENTION_DAYS = (() => {
  const parsed = Number(process.env.MINER_SNAPSHOT_RETENTION_DAYS ?? 7);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 7;
  }
  return Math.round(parsed);
})();

const SNAPSHOT_RETENTION_INTERVAL_MS = (() => {
  const parsed = Number(process.env.MINER_SNAPSHOT_RETENTION_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
  if (!Number.isFinite(parsed) || parsed < 60 * 60 * 1000) {
    return 24 * 60 * 60 * 1000;
  }
  return Math.round(parsed);
})();

const SNAPSHOT_PRUNE_BATCH_SIZE = (() => {
  const parsed = Number(process.env.MINER_SNAPSHOT_PRUNE_BATCH_SIZE ?? 100);
  if (!Number.isInteger(parsed) || parsed < 10) {
    return 100;
  }
  return Math.min(parsed, 10_000);
})();

const SNAPSHOT_PRUNE_MAX_BATCHES = (() => {
  const parsed = Number(process.env.MINER_SNAPSHOT_PRUNE_MAX_BATCHES ?? 5);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 5;
  }
  return Math.min(parsed, 500);
})();

export interface MinerPollResult {
  started: boolean;
  success: boolean;
  skippedReason: "already_running" | null;
  startedAt: string | null;
  finishedAt: string;
  durationMs: number;
  runningForMs: number | null;
  totalMiners: number;
  succeeded: number;
  failed: number;
  prunedSnapshots: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function isValidTemperature(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 150;
}

function hottestTemperature(readResult: MinerReadResult): number | null {
  const temperatures = [...readResult.liveData.boardTemps, ...readResult.liveData.hotspotTemps].filter(isValidTemperature);
  if (temperatures.length === 0) {
    return null;
  }
  return Math.max(...temperatures);
}

function parsePresetPowerHint(preset: MinerPresetOption): number | null {
  const label = `${preset.pretty ?? ""} ${preset.name}`.trim();
  if (!label) return null;
  const match = /(\d+(?:\.\d+)?)\s*w(?:att)?/i.exec(label);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortPresetsForPowerScaling(presets: MinerPresetOption[]): MinerPresetOption[] {
  const ranked = presets.map((preset, index) => ({
    preset,
    index,
    powerHint: parsePresetPowerHint(preset),
  }));
  const fullyHinted = ranked.every((entry) => entry.powerHint !== null);

  if (!fullyHinted) {
    return presets;
  }

  return ranked
    .sort((left, right) => {
      if (left.powerHint === right.powerHint) {
        return left.index - right.index;
      }
      return (left.powerHint ?? 0) - (right.powerHint ?? 0);
    })
    .map((entry) => entry.preset);
}

export class MinerPollingService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private runningStartedAt: number | null = null;
  private retentionRunning = false;
  private lastRetentionRunAt = Date.now();
  private readonly failureCounts = new Map<number, number>();

  constructor(
    private readonly repository: MinerRepository,
    private readonly readService: MinerReadService,
    private readonly commandService: MinerCommandService,
    private readonly pollIntervalMs = 15_000,
    private readonly pollConcurrency = 3,
    private readonly ingestPublisher: MinerIngestPublisher | null = null
  ) {}

  start(): void {
    if (this.timer) return;

    const loop = async () => {
      try {
        await this.pollOnce();
      } finally {
        this.timer = setTimeout(loop, this.pollIntervalMs);
      }
    };

    this.timer = setTimeout(loop, 1_000);
  }

  stop(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private async markOfflineAfterFailure(minerId: number, errorMessage: string): Promise<void> {
    const nextFailureCount = (this.failureCounts.get(minerId) ?? 0) + 1;
    this.failureCounts.set(minerId, nextFailureCount);

    await this.repository.updateMiner(minerId, {
      lastError: errorMessage,
    });

    if (nextFailureCount < 2) {
      return;
    }

    const miner = await this.repository.getMinerById(minerId);
    await this.repository.saveSnapshot({
      minerId,
      online: false,
      minerState: "offline",
      presetName: miner?.currentPreset ?? null,
      presetPretty: null,
      presetStatus: null,
      totalRateThs: 0,
      boardTemps: [],
      hotspotTemps: [],
      fanPwm: null,
      fanRpm: [],
      powerWatts: 0,
      raw: {
        pollingError: errorMessage,
      },
    });
  }

  private shouldApplyTemperatureControl(miner: MinerEntity, readResult: MinerReadResult): boolean {
    if (!miner.temperatureControlEnabled) {
      return false;
    }

    if (
      miner.temperatureControlMin === null ||
      miner.temperatureControlMax === null ||
      miner.temperatureControlMin >= miner.temperatureControlMax
    ) {
      return false;
    }

    if (!readResult.liveData.online) {
      return false;
    }

    const normalizedState = readResult.liveData.minerState?.trim().toLowerCase();
    if (normalizedState && ["offline", "stopped", "paused", "disabled"].includes(normalizedState)) {
      return false;
    }

    if ((readResult.liveData.totalRateThs ?? 0) <= 0 && normalizedState !== "mining") {
      return false;
    }

    return Array.isArray(readResult.presets) && readResult.presets.length > 1;
  }

  private async applyTemperatureControl(miner: MinerEntity, readResult: MinerReadResult): Promise<void> {
    if (!this.shouldApplyTemperatureControl(miner, readResult)) {
      return;
    }

    const hottestTemp = hottestTemperature(readResult);
    if (hottestTemp === null) {
      return;
    }

    const presets = sortPresetsForPowerScaling(normalizePresetOptions(readResult.presets ?? []));

    if (presets.length < 2) {
      return;
    }

    const currentPresetName = (readResult.liveData.presetName ?? miner.currentPreset)?.trim().toLowerCase();
    if (!currentPresetName) {
      return;
    }

    const currentIndex = presets.findIndex((preset) => preset.name.trim().toLowerCase() === currentPresetName);
    if (currentIndex < 0) {
      return;
    }

    const lastAdjustedAt = miner.temperatureControlLastAdjustedAt
      ? new Date(miner.temperatureControlLastAdjustedAt).getTime()
      : 0;
    if (lastAdjustedAt > 0 && Date.now() - lastAdjustedAt < TEMP_CONTROL_COOLDOWN_MS) {
      return;
    }

    let targetPreset: MinerPresetOption | null = null;
    if (hottestTemp < miner.temperatureControlMin! && currentIndex < presets.length - 1) {
      targetPreset = presets[currentIndex + 1];
    } else if (hottestTemp > miner.temperatureControlMax! && currentIndex > 0) {
      targetPreset = presets[currentIndex - 1];
    }

    if (!targetPreset || targetPreset.name.trim().toLowerCase() === currentPresetName) {
      return;
    }

    await this.commandService.setPreset(miner.id, targetPreset.name, "thermal-controller");
    await this.repository.updateMiner(miner.id, {
      currentPreset: targetPreset.name,
      temperatureControlLastAdjustedAt: new Date().toISOString(),
      lastError: null,
    });
  }

  private startOldSnapshotPruneIfDue(): void {
    const now = Date.now();
    if (
      SNAPSHOT_RETENTION_DAYS < 1 ||
      this.retentionRunning ||
      now - this.lastRetentionRunAt < SNAPSHOT_RETENTION_INTERVAL_MS
    ) {
      return;
    }

    this.lastRetentionRunAt = now;
    this.retentionRunning = true;

    void (async () => {
      const cutoffIso = new Date(now - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      let totalDeleted = 0;

      try {
        for (let batch = 0; batch < SNAPSHOT_PRUNE_MAX_BATCHES; batch += 1) {
          const deleted = await this.repository.pruneSnapshotsBefore(cutoffIso, SNAPSHOT_PRUNE_BATCH_SIZE);
          totalDeleted += deleted;
          if (deleted === 0) {
            break;
          }
        }

        if (totalDeleted > 0) {
          console.info(
            `[miner-retention] Deleted ${totalDeleted} snapshot(s) older than ${cutoffIso} ` +
              `(retention ${SNAPSHOT_RETENTION_DAYS} day${SNAPSHOT_RETENTION_DAYS === 1 ? "" : "s"}).`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown retention cleanup error.";
        console.error(`[miner-retention] Failed to prune old snapshots: ${message}`);
      } finally {
        this.retentionRunning = false;
      }
    })();
  }

  getStatus(): { running: boolean; startedAt: string | null; runningForMs: number | null } {
    return {
      running: this.running,
      startedAt: this.runningStartedAt ? new Date(this.runningStartedAt).toISOString() : null,
      runningForMs: this.runningStartedAt ? Date.now() - this.runningStartedAt : null,
    };
  }

  async pollOnce(): Promise<MinerPollResult> {
    const now = Date.now();
    if (this.running) {
      return {
        started: false,
        success: false,
        skippedReason: "already_running",
        startedAt: this.runningStartedAt ? new Date(this.runningStartedAt).toISOString() : null,
        finishedAt: new Date(now).toISOString(),
        durationMs: 0,
        runningForMs: this.runningStartedAt ? now - this.runningStartedAt : null,
        totalMiners: 0,
        succeeded: 0,
        failed: 0,
        prunedSnapshots: 0,
      };
    }

    this.running = true;
    this.runningStartedAt = now;
    let totalMiners = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      const miners = await this.repository.listEnabledMiners();
      totalMiners = miners.length;
      const ingestSnapshots: MinerIngestSnapshot[] = [];
      const safeConcurrency = Math.max(1, Math.floor(this.pollConcurrency));

      for (let index = 0; index < miners.length; index += safeConcurrency) {
        const minerBatch = miners.slice(index, index + safeConcurrency);
        const batchResults = await Promise.all(
          minerBatch.map(async (miner) => {
            try {
              const readResult = await withTimeout(
                this.readService.readMiner(miner),
                MINER_READ_TIMEOUT_MS,
                `Miner ${miner.name} (${miner.ip}) read timed out after ${MINER_READ_TIMEOUT_MS}ms.`
              );

              if (!readResult.httpOk && !readResult.cgminerOk) {
                throw new Error("Both VNish HTTP and CGMiner reads failed.");
              }

              this.failureCounts.set(miner.id, 0);

              await this.repository.saveSnapshot({
                minerId: miner.id,
                online: readResult.liveData.online,
                minerState: readResult.liveData.minerState,
                presetName: readResult.liveData.presetName,
                presetPretty: readResult.liveData.presetPretty,
                presetStatus: readResult.liveData.presetStatus,
                totalRateThs: readResult.liveData.totalRateThs,
                boardTemps: readResult.liveData.boardTemps,
                hotspotTemps: readResult.liveData.hotspotTemps,
                fanPwm: readResult.liveData.fanPwm,
                fanRpm: readResult.liveData.fanRpm,
                powerWatts: readResult.liveData.powerWatts,
                raw: liveDataToSnapshotRaw(readResult.liveData),
              });

              await this.repository.replacePools(miner.id, normalizePoolsForStorage(readResult.cgminerPools));
              await this.repository.updateMiner(miner.id, {
                lastSeenAt: readResult.liveData.lastSeenAt ?? new Date().toISOString(),
                lastError: null,
                currentPreset: readResult.liveData.presetName,
              });

              await this.applyTemperatureControl(miner, readResult).catch(async (error) => {
                const message = error instanceof Error ? error.message : "Automatic thermal preset control failed.";
                await this.repository.updateMiner(miner.id, {
                  lastError: message,
                });
                console.error(`[miner-temp-control] Miner ${miner.id} (${miner.name}) failed: ${message}`);
              });

              return {
                miner,
                error: null,
                ingestSnapshot: this.ingestPublisher?.createSnapshotFromRead(miner, readResult) ?? null,
              };
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown polling error.";
              return {
                miner,
                error: message,
                ingestSnapshot: this.ingestPublisher?.createFailureSnapshot(miner, message) ?? null,
              };
            }
          })
        );

        for (const result of batchResults) {
          if (result.ingestSnapshot) {
            ingestSnapshots.push(result.ingestSnapshot);
          }

          if (result.error) {
            failed += 1;
            await this.markOfflineAfterFailure(result.miner.id, result.error);
          } else {
            succeeded += 1;
          }
        }
      }

      if (this.ingestPublisher?.isEnabled() && ingestSnapshots.length > 0) {
        await this.ingestPublisher.publishSnapshots(ingestSnapshots).catch((error) => {
          const message = error instanceof Error ? error.message : "Unknown ingest error.";
          console.error(`[miner-ingest] Failed to publish ${ingestSnapshots.length} miner snapshot(s): ${message}`);
        });
      }

      this.startOldSnapshotPruneIfDue();

      return {
        started: true,
        success: failed === 0,
        skippedReason: null,
        startedAt: new Date(now).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - now,
        runningForMs: null,
        totalMiners,
        succeeded,
        failed,
        prunedSnapshots: 0,
      };
    } finally {
      this.running = false;
      this.runningStartedAt = null;
    }
  }
}
