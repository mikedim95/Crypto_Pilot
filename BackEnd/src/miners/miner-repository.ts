import type { PoolConnection } from "mysql2/promise";
import pool from "../db.js";
import { minerColumnBackfillStatements, minerSchemaStatements } from "./miner-schema.js";
import {
  FleetHistoryBucketRecord,
  FleetHistoryBucketByMinerRecord,
  FleetHistoryPoint,
  MinerCommandEntity,
  MinerCommandLogInput,
  MinerCommandRecord,
  MinerEntity,
  MinerPersistInput,
  MinerPoolEntity,
  MinerPoolPersistInput,
  MinerPoolRecord,
  MinerSnapshotEntity,
  MinerSnapshotPersistInput,
  MinerSnapshotRecord,
  MinerRecord,
  MinerUpdateInput,
} from "./types.js";
import { mapCommandRecord, mapMinerRecord, mapPoolRecord, mapSnapshotRecord, toMysqlDateTime } from "./miner-utils.js";

const DEFAULT_HISTORY_MAX_ROWS_PER_MINER = 500;

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim().length > 0 ? code : null;
}

function isIgnorableBackfillError(error: unknown): boolean {
  const code = extractErrorCode(error);
  return code === "ER_DUP_FIELDNAME" || code === "ER_DUP_KEYNAME";
}

interface FleetHistoryAccumulator {
  bucketIndex: number;
  online: boolean;
  totalRateSum: number;
  totalRateCount: number;
  powerSum: number;
  powerCount: number;
  maxBoardTemp: number | null;
  maxHotspotTemp: number | null;
}

function validTemperature(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 150 ? value : null;
}

function maxNullable(values: Array<number | null>): number | null {
  return values.reduce<number | null>((max, value) => {
    if (value === null) return max;
    return max === null ? value : Math.max(max, value);
  }, null);
}

export class MinerRepository {
  private initPromise: Promise<void> | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.ensureSchema()
        .then(() => {
          this.initialized = true;
        })
        .catch((error) => {
          this.initPromise = null;
          this.initialized = false;
          throw error;
        });
    }
    await this.initPromise;
  }

  private async ensureSchema(): Promise<void> {
    const conn = await pool.getConnection();
    try {
      for (const statement of minerSchemaStatements) {
        await conn.query(statement);
      }

      for (const statement of minerColumnBackfillStatements) {
        try {
          await conn.query(statement);
        } catch (error) {
          if (!isIgnorableBackfillError(error)) {
            throw error;
          }
        }
      }
    } finally {
      conn.release();
    }
  }

  private async withConnection<T>(handler: (conn: PoolConnection) => Promise<T>): Promise<T> {
    await this.init();
    const conn = await pool.getConnection();
    try {
      return await handler(conn);
    } finally {
      conn.release();
    }
  }

  async listMiners(): Promise<MinerEntity[]> {
    await this.init();
    const [rows] = await pool.query<MinerRecord[]>(
      `
        SELECT *
        FROM miners
        ORDER BY name ASC, id ASC
      `
    );
    return rows.map(mapMinerRecord);
  }

  async listEnabledMiners(): Promise<MinerEntity[]> {
    await this.init();
    const [rows] = await pool.query<MinerRecord[]>(
      `
        SELECT *
        FROM miners
        WHERE is_enabled = 1
        ORDER BY name ASC, id ASC
      `
    );
    return rows.map(mapMinerRecord);
  }

  async getMinerById(minerId: number): Promise<MinerEntity | null> {
    await this.init();
    const [rows] = await pool.query<MinerRecord[]>(
      `
        SELECT *
        FROM miners
        WHERE id = ?
        LIMIT 1
      `,
      [minerId]
    );
    const row = rows[0];
    return row ? mapMinerRecord(row) : null;
  }

  async getMinerByIp(ip: string): Promise<MinerEntity | null> {
    await this.init();
    const [rows] = await pool.query<MinerRecord[]>(
      `
        SELECT *
        FROM miners
        WHERE ip = ?
        LIMIT 1
      `,
      [ip.trim()]
    );
    const row = rows[0];
    return row ? mapMinerRecord(row) : null;
  }

  async createMiner(input: MinerPersistInput): Promise<MinerEntity> {
    return this.withConnection(async (conn) => {
      const [result] = await conn.query(
        `
          INSERT INTO miners (
            name,
            ip,
            api_base_url,
            password_enc,
            model,
            firmware,
            current_preset,
            temp_control_enabled,
            temp_control_min,
            temp_control_max,
            temp_control_last_adjusted_at,
            is_enabled,
            verification_status,
            last_seen_at,
            last_error,
            capabilities_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          input.name,
          input.ip,
          input.apiBaseUrl,
          input.passwordEnc,
          input.model ?? null,
          input.firmware ?? null,
          input.currentPreset ?? null,
          input.temperatureControlEnabled ?? false,
          input.temperatureControlMin ?? null,
          input.temperatureControlMax ?? null,
          toMysqlDateTime(input.temperatureControlLastAdjustedAt),
          input.isEnabled ?? true,
          input.verificationStatus,
          toMysqlDateTime(input.lastSeenAt),
          input.lastError ?? null,
          input.capabilities ? JSON.stringify(input.capabilities) : null,
        ]
      );

      const insertId = Number((result as { insertId?: number }).insertId ?? 0);
      const miner = await this.getMinerById(insertId);
      if (!miner) {
        throw new Error("Failed to load created miner.");
      }
      return miner;
    });
  }

  async updateMiner(minerId: number, patch: MinerUpdateInput & Partial<MinerPersistInput>): Promise<MinerEntity | null> {
    return this.withConnection(async (conn) => {
      const updates: string[] = [];
      const values: unknown[] = [];

      const push = (field: string, value: unknown) => {
        updates.push(`${field} = ?`);
        values.push(value);
      };

      if (typeof patch.name === "string") push("name", patch.name);
      if (typeof patch.ip === "string") push("ip", patch.ip);
      if (typeof patch.apiBaseUrl === "string") push("api_base_url", patch.apiBaseUrl);
      if (typeof patch.passwordEnc === "string") push("password_enc", patch.passwordEnc);
      if ("model" in patch) push("model", patch.model ?? null);
      if ("firmware" in patch) push("firmware", patch.firmware ?? null);
      if ("currentPreset" in patch) push("current_preset", patch.currentPreset ?? null);
      if (typeof patch.temperatureControlEnabled === "boolean") push("temp_control_enabled", patch.temperatureControlEnabled);
      if ("temperatureControlMin" in patch) push("temp_control_min", patch.temperatureControlMin ?? null);
      if ("temperatureControlMax" in patch) push("temp_control_max", patch.temperatureControlMax ?? null);
      if ("temperatureControlLastAdjustedAt" in patch) {
        push("temp_control_last_adjusted_at", toMysqlDateTime(patch.temperatureControlLastAdjustedAt));
      }
      if (typeof patch.isEnabled === "boolean") push("is_enabled", patch.isEnabled);
      if (typeof patch.verificationStatus === "string") push("verification_status", patch.verificationStatus);
      if ("lastSeenAt" in patch) push("last_seen_at", toMysqlDateTime(patch.lastSeenAt));
      if ("lastError" in patch) push("last_error", patch.lastError ?? null);
      if ("capabilities" in patch) push("capabilities_json", patch.capabilities ? JSON.stringify(patch.capabilities) : null);

      if (updates.length === 0) {
        return this.getMinerById(minerId);
      }

      values.push(minerId);
      await conn.query(
        `
          UPDATE miners
          SET ${updates.join(", ")}
          WHERE id = ?
        `,
        values
      );

      return this.getMinerById(minerId);
    });
  }

  async setMinerEnabled(minerId: number, enabled: boolean): Promise<MinerEntity | null> {
    return this.updateMiner(minerId, { isEnabled: enabled });
  }

  async saveSnapshot(input: MinerSnapshotPersistInput): Promise<MinerSnapshotEntity> {
    return this.withConnection(async (conn) => {
      const [result] = await conn.query(
        `
          INSERT INTO miner_status_snapshots (
            miner_id,
            online,
            miner_state,
            preset_name,
            preset_pretty,
            preset_status,
            total_rate_ths,
            board_temp_1,
            board_temp_2,
            board_temp_3,
            hotspot_temp_1,
            hotspot_temp_2,
            hotspot_temp_3,
            fan_pwm,
            fan_rpm_1,
            fan_rpm_2,
            fan_rpm_3,
            fan_rpm_4,
            power_watts,
            raw_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          input.minerId,
          input.online,
          input.minerState,
          input.presetName,
          input.presetPretty,
          input.presetStatus,
          input.totalRateThs,
          input.boardTemps[0] ?? null,
          input.boardTemps[1] ?? null,
          input.boardTemps[2] ?? null,
          input.hotspotTemps[0] ?? null,
          input.hotspotTemps[1] ?? null,
          input.hotspotTemps[2] ?? null,
          input.fanPwm,
          input.fanRpm[0] ?? null,
          input.fanRpm[1] ?? null,
          input.fanRpm[2] ?? null,
          input.fanRpm[3] ?? null,
          input.powerWatts,
          JSON.stringify(input.raw ?? null),
        ]
      );

      const insertId = Number((result as { insertId?: number }).insertId ?? 0);
      const snapshot = await this.getSnapshotById(insertId);
      if (!snapshot) {
        throw new Error("Failed to load created snapshot.");
      }
      return snapshot;
    });
  }

  async getSnapshotById(snapshotId: number): Promise<MinerSnapshotEntity | null> {
    await this.init();
    const [rows] = await pool.query<MinerSnapshotRecord[]>(
      `
        SELECT *
        FROM miner_status_snapshots
        WHERE id = ?
        LIMIT 1
      `,
      [snapshotId]
    );
    const row = rows[0];
    return row ? mapSnapshotRecord(row) : null;
  }

  async getLatestSnapshot(minerId: number): Promise<MinerSnapshotEntity | null> {
    await this.init();
    const [rows] = await pool.query<MinerSnapshotRecord[]>(
      `
        SELECT snapshot.*
        FROM miner_status_snapshots snapshot
        INNER JOIN (
          SELECT MAX(id) AS id
          FROM miner_status_snapshots
          WHERE miner_id = ?
        ) latest ON latest.id = snapshot.id
      `,
      [minerId]
    );
    const row = rows[0];
    return row ? mapSnapshotRecord(row) : null;
  }

  async listLatestSnapshots(): Promise<MinerSnapshotEntity[]> {
    await this.init();
    const [rows] = await pool.query<MinerSnapshotRecord[]>(
      `
        SELECT snapshot.*
        FROM miner_status_snapshots snapshot
        INNER JOIN (
          SELECT miner_id, MAX(id) AS latest_id
          FROM miner_status_snapshots
          GROUP BY miner_id
        ) latest ON latest.latest_id = snapshot.id
        ORDER BY snapshot.miner_id ASC
      `
    );
    return rows.map(mapSnapshotRecord);
  }

  async listHistory(minerId: number, limit = 100): Promise<MinerSnapshotEntity[]> {
    await this.init();
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
    const [rows] = await pool.query<MinerSnapshotRecord[]>(
      `
        SELECT *
        FROM miner_status_snapshots
        WHERE miner_id = ?
        ORDER BY id DESC
        LIMIT ?
      `,
      [minerId, safeLimit]
    );
    return rows.map(mapSnapshotRecord);
  }

  async listHistorySince(minerId: number, sinceIso: string): Promise<MinerSnapshotEntity[]> {
    await this.init();
    const [rows] = await pool.query<MinerSnapshotRecord[]>(
      `
        SELECT *
        FROM miner_status_snapshots
        WHERE miner_id = ?
          AND created_at >= ?
        ORDER BY created_at ASC, id ASC
      `,
      [minerId, toMysqlDateTime(sinceIso)]
    );
    return rows.map(mapSnapshotRecord);
  }

  async listHistoryBucketsSince(minerId: number, sinceIso: string, bucketSeconds: number): Promise<FleetHistoryPoint[]> {
    await this.init();

    const safeBucketSeconds = Number.isInteger(bucketSeconds) && bucketSeconds > 0 ? bucketSeconds : 60;
    const [rows] = await pool.query<FleetHistoryBucketRecord[]>(
      `
        SELECT
          FLOOR(UNIX_TIMESTAMP(created_at) / ?) AS bucket_index,
          MAX(CASE WHEN online = 1 THEN 1 ELSE 0 END) AS online,
          AVG(CASE WHEN total_rate_ths IS NOT NULL THEN total_rate_ths END) AS avg_total_rate_ths,
          AVG(CASE WHEN power_watts > 0 THEN power_watts END) AS avg_power_watts,
          NULLIF(
            MAX(
              GREATEST(
                IF(board_temp_1 > 0 AND board_temp_1 <= 150, board_temp_1, -1),
                IF(board_temp_2 > 0 AND board_temp_2 <= 150, board_temp_2, -1),
                IF(board_temp_3 > 0 AND board_temp_3 <= 150, board_temp_3, -1)
              )
            ),
            -1
          ) AS max_board_temp,
          NULLIF(
            MAX(
              GREATEST(
                IF(hotspot_temp_1 > 0 AND hotspot_temp_1 <= 150, hotspot_temp_1, -1),
                IF(hotspot_temp_2 > 0 AND hotspot_temp_2 <= 150, hotspot_temp_2, -1),
                IF(hotspot_temp_3 > 0 AND hotspot_temp_3 <= 150, hotspot_temp_3, -1)
              )
            ),
            -1
          ) AS max_hotspot_temp
        FROM miner_status_snapshots
        WHERE miner_id = ?
          AND created_at >= ?
        GROUP BY bucket_index
        ORDER BY bucket_index ASC
      `,
      [safeBucketSeconds, minerId, toMysqlDateTime(sinceIso)]
    );

    return rows
      .map((row) => this.mapFleetHistoryBucket(row, safeBucketSeconds))
      .filter((point): point is FleetHistoryPoint => point !== null);
  }

  async listHistoryBucketsForMinerIdsSince(
    minerIds: number[],
    sinceIso: string,
    bucketSeconds: number
  ): Promise<Map<number, FleetHistoryPoint[]>> {
    await this.init();

    const safeMinerIds = [...new Set(minerIds.filter((minerId) => Number.isInteger(minerId) && minerId > 0))];
    const pointsByMinerId = new Map<number, FleetHistoryPoint[]>();
    for (const minerId of safeMinerIds) {
      pointsByMinerId.set(minerId, []);
    }

    if (safeMinerIds.length === 0) {
      return pointsByMinerId;
    }

    const safeBucketSeconds = Number.isInteger(bucketSeconds) && bucketSeconds > 0 ? bucketSeconds : 60;
    const maxRowsPerMiner = (() => {
      const parsed = Number(process.env.MINER_HISTORY_MAX_ROWS_PER_MINER ?? DEFAULT_HISTORY_MAX_ROWS_PER_MINER);
      return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 20_000) : DEFAULT_HISTORY_MAX_ROWS_PER_MINER;
    })();

    await Promise.all(
      safeMinerIds.map(async (minerId) => {
        const [rows] = await pool.query<MinerSnapshotRecord[]>(
          `
            SELECT
              id,
              miner_id,
              online,
              miner_state,
              preset_name,
              preset_pretty,
              preset_status,
              total_rate_ths,
              board_temp_1,
              board_temp_2,
              board_temp_3,
              hotspot_temp_1,
              hotspot_temp_2,
              hotspot_temp_3,
              fan_pwm,
              fan_rpm_1,
              fan_rpm_2,
              fan_rpm_3,
              fan_rpm_4,
              power_watts,
              NULL AS raw_json,
              created_at
            FROM miner_status_snapshots FORCE INDEX (idx_miner_status_snapshots_miner_created)
            WHERE miner_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `,
          [minerId, maxRowsPerMiner]
        );

        pointsByMinerId.set(minerId, this.mapSnapshotRowsToFleetHistoryPoints(rows, safeBucketSeconds, sinceIso));
      })
    );

    return pointsByMinerId;
  }

  private mapSnapshotRowsToFleetHistoryPoints(
    rows: MinerSnapshotRecord[],
    bucketSeconds: number,
    sinceIso: string
  ): FleetHistoryPoint[] {
    const buckets = new Map<number, FleetHistoryAccumulator>();
    const sinceTime = new Date(sinceIso).getTime();

    for (const row of rows) {
      const createdAt = new Date(row.created_at).getTime();
      if (!Number.isFinite(createdAt)) {
        continue;
      }
      if (Number.isFinite(sinceTime) && createdAt < sinceTime) {
        continue;
      }

      const bucketIndex = Math.floor(createdAt / 1000 / bucketSeconds);
      const existing =
        buckets.get(bucketIndex) ??
        {
          bucketIndex,
          online: false,
          totalRateSum: 0,
          totalRateCount: 0,
          powerSum: 0,
          powerCount: 0,
          maxBoardTemp: null,
          maxHotspotTemp: null,
        };

      existing.online = existing.online || row.online === true || row.online === 1;
      if (typeof row.total_rate_ths === "number" && Number.isFinite(row.total_rate_ths)) {
        existing.totalRateSum += row.total_rate_ths;
        existing.totalRateCount += 1;
      }
      if (typeof row.power_watts === "number" && Number.isFinite(row.power_watts) && row.power_watts > 0) {
        existing.powerSum += row.power_watts;
        existing.powerCount += 1;
      }

      const maxBoardTemp = maxNullable([
        validTemperature(row.board_temp_1),
        validTemperature(row.board_temp_2),
        validTemperature(row.board_temp_3),
      ]);
      const maxHotspotTemp = maxNullable([
        validTemperature(row.hotspot_temp_1),
        validTemperature(row.hotspot_temp_2),
        validTemperature(row.hotspot_temp_3),
      ]);

      if (maxBoardTemp !== null) {
        existing.maxBoardTemp = existing.maxBoardTemp === null ? maxBoardTemp : Math.max(existing.maxBoardTemp, maxBoardTemp);
      }
      if (maxHotspotTemp !== null) {
        existing.maxHotspotTemp =
          existing.maxHotspotTemp === null ? maxHotspotTemp : Math.max(existing.maxHotspotTemp, maxHotspotTemp);
      }

      buckets.set(bucketIndex, existing);
    }

    return Array.from(buckets.values())
      .sort((left, right) => left.bucketIndex - right.bucketIndex)
      .map((bucket) => ({
        timestamp: new Date(bucket.bucketIndex * bucketSeconds * 1000).toISOString(),
        online: bucket.online,
        totalRateThs: bucket.totalRateCount > 0 ? Number((bucket.totalRateSum / bucket.totalRateCount).toFixed(2)) : null,
        maxBoardTemp: bucket.maxBoardTemp,
        maxHotspotTemp: bucket.maxHotspotTemp,
        maxTemp: bucket.maxHotspotTemp ?? bucket.maxBoardTemp,
        powerWatts: bucket.powerCount > 0 ? Math.round(bucket.powerSum / bucket.powerCount) : null,
      }));
  }

  async replacePools(minerId: number, pools: MinerPoolPersistInput[]): Promise<MinerPoolEntity[]> {
    return this.withConnection(async (conn) => {
      await conn.query(`DELETE FROM miner_pools WHERE miner_id = ?`, [minerId]);

      for (const poolInput of pools) {
        await conn.query(
          `
            INSERT INTO miner_pools (
              miner_id,
              pool_index,
              url,
              username,
              status,
              is_active
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            minerId,
            poolInput.poolIndex,
            poolInput.url,
            poolInput.username,
            poolInput.status,
            poolInput.isActive,
          ]
        );
      }

      const [rows] = await conn.query<MinerPoolRecord[]>(
        `
          SELECT *
          FROM miner_pools
          WHERE miner_id = ?
          ORDER BY pool_index ASC
        `,
        [minerId]
      );
      return rows.map(mapPoolRecord);
    });
  }

  async listPools(minerId: number): Promise<MinerPoolEntity[]> {
    await this.init();
    const [rows] = await pool.query<MinerPoolRecord[]>(
      `
        SELECT *
        FROM miner_pools
        WHERE miner_id = ?
        ORDER BY pool_index ASC
      `,
      [minerId]
    );
    return rows.map(mapPoolRecord);
  }

  async listPoolsForMinerIds(minerIds: number[]): Promise<Map<number, MinerPoolEntity[]>> {
    await this.init();

    const safeMinerIds = [...new Set(minerIds.filter((minerId) => Number.isInteger(minerId) && minerId > 0))];
    const poolsByMinerId = new Map<number, MinerPoolEntity[]>();
    for (const minerId of safeMinerIds) {
      poolsByMinerId.set(minerId, []);
    }

    if (safeMinerIds.length === 0) {
      return poolsByMinerId;
    }

    const placeholders = safeMinerIds.map(() => "?").join(", ");
    const [rows] = await pool.query<MinerPoolRecord[]>(
      `
        SELECT *
        FROM miner_pools
        WHERE miner_id IN (${placeholders})
        ORDER BY miner_id ASC, pool_index ASC
      `,
      safeMinerIds
    );

    for (const row of rows) {
      const poolEntity = mapPoolRecord(row);
      const pools = poolsByMinerId.get(poolEntity.minerId);
      if (pools) {
        pools.push(poolEntity);
        continue;
      }

      poolsByMinerId.set(poolEntity.minerId, [poolEntity]);
    }

    return poolsByMinerId;
  }

  async logCommand(input: MinerCommandLogInput): Promise<MinerCommandEntity> {
    return this.withConnection(async (conn) => {
      const [result] = await conn.query(
        `
          INSERT INTO miner_commands (
            miner_id,
            command_type,
            request_json,
            response_json,
            status,
            error_text,
            created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          input.minerId,
          input.commandType,
          input.request ? JSON.stringify(input.request) : null,
          input.response ? JSON.stringify(input.response) : null,
          input.status,
          input.errorText ?? null,
          input.createdBy ?? null,
        ]
      );

      const insertId = Number((result as { insertId?: number }).insertId ?? 0);
      const [rows] = await conn.query<MinerCommandRecord[]>(
        `
          SELECT *
          FROM miner_commands
          WHERE id = ?
          LIMIT 1
        `,
        [insertId]
      );
      const row = rows[0];
      if (!row) {
        throw new Error("Failed to load created command log.");
      }
      return mapCommandRecord(row);
    });
  }

  async listCommands(minerId: number, limit = 50): Promise<MinerCommandEntity[]> {
    await this.init();
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
    const [rows] = await pool.query<MinerCommandRecord[]>(
      `
        SELECT *
        FROM miner_commands
        WHERE miner_id = ?
        ORDER BY id DESC
        LIMIT ?
      `,
      [minerId, safeLimit]
    );
    return rows.map(mapCommandRecord);
  }

  private mapFleetHistoryBucket(
    row: FleetHistoryBucketRecord | FleetHistoryBucketByMinerRecord,
    bucketSeconds: number
  ): FleetHistoryPoint | null {
    const bucketIndex = Number(row.bucket_index);
    if (!Number.isFinite(bucketIndex)) return null;

    const totalRateThs =
      typeof row.avg_total_rate_ths === "number" && Number.isFinite(row.avg_total_rate_ths)
        ? Number(row.avg_total_rate_ths.toFixed(2))
        : null;
    const powerWatts =
      typeof row.avg_power_watts === "number" && Number.isFinite(row.avg_power_watts)
        ? Math.round(row.avg_power_watts)
        : null;
    const maxBoardTemp =
      typeof row.max_board_temp === "number" && Number.isFinite(row.max_board_temp) ? row.max_board_temp : null;
    const maxHotspotTemp =
      typeof row.max_hotspot_temp === "number" && Number.isFinite(row.max_hotspot_temp) ? row.max_hotspot_temp : null;

    return {
      timestamp: new Date(bucketIndex * bucketSeconds * 1000).toISOString(),
      online: row.online === true || row.online === 1,
      totalRateThs,
      maxBoardTemp,
      maxHotspotTemp,
      maxTemp: maxHotspotTemp ?? maxBoardTemp,
      powerWatts,
    } satisfies FleetHistoryPoint;
  }
}
