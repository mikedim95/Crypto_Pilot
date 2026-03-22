import { StrategyRepository } from "./strategy-repository.js";
import { StrategyJobService } from "./strategy-job-service.js";
import { StrategyRunner } from "./strategy-runner.js";
import type { PortfolioAccountType } from "./types.js";

function resolveScheduledAccountType(): PortfolioAccountType {
  return String(process.env.STRATEGY_SCHEDULE_ACCOUNT_TYPE ?? "demo").toLowerCase() === "real" ? "real" : "demo";
}

export class StrategyScheduler {
  private timer: NodeJS.Timeout | null = null;
  private runningTick = false;
  private started = false;
  private readonly scheduledAccountType = resolveScheduledAccountType();

  constructor(
    private readonly repository: StrategyRepository,
    private readonly runner: StrategyRunner,
    private readonly jobService: StrategyJobService,
    private readonly pollIntervalMs = 15_000
  ) {}

  private scheduleNextTick(delayMs = this.pollIntervalMs): void {
    if (!this.started) {
      return;
    }

    this.timer = setTimeout(() => {
      void this.loop();
    }, Math.max(0, delayMs));
  }

  private async loop(): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      await this.tick();
    } finally {
      this.scheduleNextTick();
    }
  }

  async start(): Promise<void> {
    await this.repository.init();
    if (this.started) return;

    this.started = true;
    this.scheduleNextTick(0);
  }

  stop(): void {
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.runningTick) return;
    this.runningTick = true;

    try {
      const nowIso = new Date().toISOString();
      const scopes = await this.repository.listUserScopes();

      for (const scope of scopes) {
        const dueStrategies = await this.repository.listDueStrategies(nowIso, scope);
        const dueProfiles = await this.repository.listDueRebalanceAllocationProfiles(nowIso, scope);

        for (const strategy of dueStrategies) {
          if (this.runner.isRunning(strategy.id, this.scheduledAccountType, scope)) {
            continue;
          }

          try {
            await this.runner.runStrategy(strategy.id, "schedule", this.scheduledAccountType, scope);
          } catch (error) {
            console.error(
              `[strategy-scheduler] user=${scope.username ?? scope.userId} strategy=${strategy.id} failed:`,
              error instanceof Error ? error.message : error
            );
          }
        }

        for (const profile of dueProfiles) {
          if (this.runner.isRunning(profile.strategyId, "demo", scope, profile.id)) {
            continue;
          }

          try {
            await this.runner.executeRebalanceAllocationProfile(profile.id, "schedule", scope, {
              respectAutoThreshold: true,
            });
          } catch (error) {
            console.error(
              `[strategy-scheduler] user=${scope.username ?? scope.userId} rebalance-allocation=${profile.id} failed:`,
              error instanceof Error ? error.message : error
            );
          }
        }
      }

      try {
        await this.jobService.processDueJobs(1);
      } catch (error) {
        console.error(
          "[strategy-scheduler] strategy job processing failed:",
          error instanceof Error ? error.message : error
        );
      }
    } finally {
      this.runningTick = false;
    }
  }
}
