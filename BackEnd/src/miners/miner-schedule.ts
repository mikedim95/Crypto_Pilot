import type { MinerEntity } from "./types.js";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ZonedClock {
  weekday: number;
  minutes: number;
}

function parseTime(value: string | null): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getZonedClock(date: Date, timeZone: string): ZonedClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  const weekday = WEEKDAY_INDEX[part("weekday")];
  const hours = Number(part("hour"));
  const minutes = Number(part("minute"));
  if (!Number.isInteger(weekday) || !Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Unable to resolve miner schedule time in ${timeZone}.`);
  }
  return { weekday, minutes: hours * 60 + minutes };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function shouldMinerBeRunning(miner: MinerEntity, now = new Date()): boolean | null {
  if (!miner.scheduleEnabled) return null;
  const start = parseTime(miner.scheduleStartTime);
  const stop = parseTime(miner.scheduleStopTime);
  if (start === null || stop === null || start === stop || miner.scheduleDays.length === 0) return null;

  const clock = getZonedClock(now, miner.scheduleTimezone);
  const selectedDays = new Set(miner.scheduleDays);
  if (start < stop) {
    return selectedDays.has(clock.weekday) && clock.minutes >= start && clock.minutes < stop;
  }

  const previousWeekday = (clock.weekday + 6) % 7;
  return (
    (selectedDays.has(clock.weekday) && clock.minutes >= start) ||
    (selectedDays.has(previousWeekday) && clock.minutes < stop)
  );
}
