export type MinerStatus = "Online" | "Offline" | "Rebooting" | "Warning" | "Overheating" | "Low Hashrate";
export type AlertSeverity = "Info" | "Warning" | "Critical";
export type AlertStatus = "Active" | "Acknowledged" | "Resolved";

export interface Miner {
  id: string;
  name: string;
  model: string;
  ip: string;
  mac: string;
  serial: string;
  firmware: string;
  status: MinerStatus;
  hashrate: number; // TH/s
  hashrateUnit: string;
  avgHashrate24h: number;
  boardTemps: number[];
  chipTemps: number[];
  fanSpeeds: number[]; // RPM
  powerDraw: number; // W
  efficiency: number; // J/TH
  pool: string;
  algorithm: string;
  worker: string;
  uptime: string;
  lastSeen: string;
  acceptedShares: number;
  rejectedShares: number;
  poolLatency: number; // ms
  earningsEstimate: number; // USD/day
  hashboards: { id: string; status: "OK" | "Warning" | "Failed"; temp: number; chips: number; chipTotal: number }[];
  powerMode: string;
  targetFreq: number;
  targetVoltage: number;
  fanMode: string;
  sparkline: number[];
}

export interface MinerAlert {
  id: string;
  time: string;
  minerName: string;
  minerId: string;
  severity: AlertSeverity;
  type: string;
  description: string;
  status: AlertStatus;
}

export interface MinerProfile {
  id: string;
  name: string;
  description: string;
  freqTarget: number;
  fanPolicy: string;
  expectedHashrate: number;
  expectedPower: number;
  thermalTarget: number;
  powerMode: string;
}

export interface MinerPool {
  id: string;
  name: string;
  url: string;
  algorithm: string;
  assignedMiners: number;
  health: "Connected" | "Degraded" | "Disconnected";
  priority: number;
}

const sparkM = (base: number, variance: number): number[] =>
  Array.from({ length: 24 }, (_, i) => base + (Math.random() - 0.5) * variance);

export const miners: Miner[] = [
  {
    id: "m1", name: "Rack-A-01", model: "Antminer S19 Pro", ip: "192.168.1.101", mac: "AA:BB:CC:01:01:01",
    serial: "SN-S19P-00481", firmware: "v2024.03.1", status: "Online",
    hashrate: 110.3, hashrateUnit: "TH/s", avgHashrate24h: 109.8,
    boardTemps: [62, 64, 63], chipTemps: [78, 81, 79], fanSpeeds: [4200, 4350],
    powerDraw: 3250, efficiency: 29.5, pool: "f2pool", algorithm: "SHA-256",
    worker: "farm01.rack_a_01", uptime: "14d 7h 23m", lastSeen: "Just now",
    acceptedShares: 482910, rejectedShares: 312, poolLatency: 18, earningsEstimate: 12.84,
    hashboards: [
      { id: "HB1", status: "OK", temp: 62, chips: 76, chipTotal: 76 },
      { id: "HB2", status: "OK", temp: 64, chips: 76, chipTotal: 76 },
      { id: "HB3", status: "OK", temp: 63, chips: 76, chipTotal: 76 },
    ],
    powerMode: "Normal", targetFreq: 600, targetVoltage: 14.5, fanMode: "Auto",
    sparkline: sparkM(110, 6),
  },
  {
    id: "m2", name: "Rack-A-02", model: "Antminer S19 Pro", ip: "192.168.1.102", mac: "AA:BB:CC:01:01:02",
    serial: "SN-S19P-00482", firmware: "v2024.03.1", status: "Warning",
    hashrate: 94.7, hashrateUnit: "TH/s", avgHashrate24h: 101.2,
    boardTemps: [68, 72, 66], chipTemps: [84, 89, 82], fanSpeeds: [5100, 5200],
    powerDraw: 3180, efficiency: 33.6, pool: "f2pool", algorithm: "SHA-256",
    worker: "farm01.rack_a_02", uptime: "3d 12h 05m", lastSeen: "Just now",
    acceptedShares: 98421, rejectedShares: 1843, poolLatency: 22, earningsEstimate: 10.92,
    hashboards: [
      { id: "HB1", status: "OK", temp: 68, chips: 76, chipTotal: 76 },
      { id: "HB2", status: "Warning", temp: 72, chips: 71, chipTotal: 76 },
      { id: "HB3", status: "OK", temp: 66, chips: 76, chipTotal: 76 },
    ],
    powerMode: "Normal", targetFreq: 600, targetVoltage: 14.5, fanMode: "Auto",
    sparkline: sparkM(97, 10),
  },
  {
    id: "m3", name: "Rack-A-03", model: "WhatsMiner M30S++", ip: "192.168.1.103", mac: "AA:BB:CC:01:01:03",
    serial: "SN-M30S-01293", firmware: "v20231201.1.2", status: "Online",
    hashrate: 112.0, hashrateUnit: "TH/s", avgHashrate24h: 111.4,
    boardTemps: [58, 60, 59], chipTemps: [72, 74, 73], fanSpeeds: [3800, 3900],
    powerDraw: 3472, efficiency: 31.0, pool: "slushpool", algorithm: "SHA-256",
    worker: "farm01.rack_a_03", uptime: "28d 3h 41m", lastSeen: "Just now",
    acceptedShares: 1283421, rejectedShares: 892, poolLatency: 14, earningsEstimate: 13.10,
    hashboards: [
      { id: "HB1", status: "OK", temp: 58, chips: 148, chipTotal: 148 },
      { id: "HB2", status: "OK", temp: 60, chips: 148, chipTotal: 148 },
      { id: "HB3", status: "OK", temp: 59, chips: 148, chipTotal: 148 },
    ],
    powerMode: "Normal", targetFreq: 580, targetVoltage: 14.2, fanMode: "Auto",
    sparkline: sparkM(112, 4),
  },
  {
    id: "m4", name: "Rack-B-01", model: "Antminer L7", ip: "192.168.1.111", mac: "AA:BB:CC:02:01:01",
    serial: "SN-L7-00112", firmware: "v2024.01.3", status: "Online",
    hashrate: 9.5, hashrateUnit: "GH/s", avgHashrate24h: 9.4,
    boardTemps: [55, 57, 56], chipTemps: [68, 71, 69], fanSpeeds: [3400, 3500],
    powerDraw: 3425, efficiency: 360.5, pool: "litecoinpool", algorithm: "Scrypt",
    worker: "farm01.rack_b_01", uptime: "42d 18h 12m", lastSeen: "Just now",
    acceptedShares: 3291842, rejectedShares: 2104, poolLatency: 28, earningsEstimate: 8.45,
    hashboards: [
      { id: "HB1", status: "OK", temp: 55, chips: 72, chipTotal: 72 },
      { id: "HB2", status: "OK", temp: 57, chips: 72, chipTotal: 72 },
      { id: "HB3", status: "OK", temp: 56, chips: 72, chipTotal: 72 },
    ],
    powerMode: "Normal", targetFreq: 700, targetVoltage: 13.8, fanMode: "Auto",
    sparkline: sparkM(9.5, 0.5),
  },
  {
    id: "m5", name: "Rack-B-02", model: "Avalon A1266", ip: "192.168.1.112", mac: "AA:BB:CC:02:01:02",
    serial: "SN-A1266-00841", firmware: "v2024.02.2", status: "Offline",
    hashrate: 0, hashrateUnit: "TH/s", avgHashrate24h: 98.2,
    boardTemps: [0, 0, 0], chipTemps: [0, 0, 0], fanSpeeds: [0, 0],
    powerDraw: 0, efficiency: 0, pool: "f2pool", algorithm: "SHA-256",
    worker: "farm01.rack_b_02", uptime: "0", lastSeen: "2h 14m ago",
    acceptedShares: 412900, rejectedShares: 290, poolLatency: 0, earningsEstimate: 0,
    hashboards: [
      { id: "HB1", status: "Failed", temp: 0, chips: 0, chipTotal: 114 },
      { id: "HB2", status: "Failed", temp: 0, chips: 0, chipTotal: 114 },
      { id: "HB3", status: "Failed", temp: 0, chips: 0, chipTotal: 114 },
    ],
    powerMode: "Off", targetFreq: 580, targetVoltage: 14.0, fanMode: "Auto",
    sparkline: sparkM(0, 0),
  },
  {
    id: "m6", name: "Rack-B-03", model: "Antminer S19 XP", ip: "192.168.1.113", mac: "AA:BB:CC:02:01:03",
    serial: "SN-S19XP-00293", firmware: "v2024.03.1", status: "Online",
    hashrate: 140.2, hashrateUnit: "TH/s", avgHashrate24h: 139.8,
    boardTemps: [60, 62, 61], chipTemps: [75, 78, 76], fanSpeeds: [4000, 4100],
    powerDraw: 3010, efficiency: 21.5, pool: "slushpool", algorithm: "SHA-256",
    worker: "farm01.rack_b_03", uptime: "21d 9h 33m", lastSeen: "Just now",
    acceptedShares: 891023, rejectedShares: 421, poolLatency: 16, earningsEstimate: 16.42,
    hashboards: [
      { id: "HB1", status: "OK", temp: 60, chips: 110, chipTotal: 110 },
      { id: "HB2", status: "OK", temp: 62, chips: 110, chipTotal: 110 },
      { id: "HB3", status: "OK", temp: 61, chips: 110, chipTotal: 110 },
    ],
    powerMode: "Normal", targetFreq: 620, targetVoltage: 14.8, fanMode: "Auto",
    sparkline: sparkM(140, 5),
  },
  {
    id: "m7", name: "Rack-C-01", model: "WhatsMiner M50S", ip: "192.168.1.121", mac: "AA:BB:CC:03:01:01",
    serial: "SN-M50S-00032", firmware: "v20240115.2.0", status: "Overheating",
    hashrate: 118.4, hashrateUnit: "TH/s", avgHashrate24h: 126.1,
    boardTemps: [78, 82, 80], chipTemps: [95, 98, 96], fanSpeeds: [6200, 6300],
    powerDraw: 3420, efficiency: 28.9, pool: "f2pool", algorithm: "SHA-256",
    worker: "farm01.rack_c_01", uptime: "7d 2h 18m", lastSeen: "Just now",
    acceptedShares: 210943, rejectedShares: 1290, poolLatency: 21, earningsEstimate: 13.72,
    hashboards: [
      { id: "HB1", status: "Warning", temp: 78, chips: 156, chipTotal: 156 },
      { id: "HB2", status: "Warning", temp: 82, chips: 154, chipTotal: 156 },
      { id: "HB3", status: "Warning", temp: 80, chips: 155, chipTotal: 156 },
    ],
    powerMode: "Normal", targetFreq: 640, targetVoltage: 15.0, fanMode: "Max",
    sparkline: sparkM(122, 12),
  },
  {
    id: "m8", name: "Rack-C-02", model: "Antminer S19 Pro", ip: "192.168.1.122", mac: "AA:BB:CC:03:01:02",
    serial: "SN-S19P-00920", firmware: "v2024.03.1", status: "Rebooting",
    hashrate: 0, hashrateUnit: "TH/s", avgHashrate24h: 108.5,
    boardTemps: [0, 0, 0], chipTemps: [0, 0, 0], fanSpeeds: [0, 0],
    powerDraw: 45, efficiency: 0, pool: "f2pool", algorithm: "SHA-256",
    worker: "farm01.rack_c_02", uptime: "0", lastSeen: "1m ago",
    acceptedShares: 329100, rejectedShares: 198, poolLatency: 0, earningsEstimate: 0,
    hashboards: [
      { id: "HB1", status: "OK", temp: 0, chips: 76, chipTotal: 76 },
      { id: "HB2", status: "OK", temp: 0, chips: 76, chipTotal: 76 },
      { id: "HB3", status: "OK", temp: 0, chips: 76, chipTotal: 76 },
    ],
    powerMode: "Normal", targetFreq: 600, targetVoltage: 14.5, fanMode: "Auto",
    sparkline: sparkM(0, 0),
  },
  {
    id: "m9", name: "Rack-C-03", model: "Antminer S19 XP", ip: "192.168.1.123", mac: "AA:BB:CC:03:01:03",
    serial: "SN-S19XP-00421", firmware: "v2024.02.1", status: "Low Hashrate",
    hashrate: 82.1, hashrateUnit: "TH/s", avgHashrate24h: 130.4,
    boardTemps: [64, 65, 63], chipTemps: [80, 82, 79], fanSpeeds: [4500, 4600],
    powerDraw: 2890, efficiency: 35.2, pool: "slushpool", algorithm: "SHA-256",
    worker: "farm01.rack_c_03", uptime: "5d 14h 02m", lastSeen: "Just now",
    acceptedShares: 189023, rejectedShares: 3421, poolLatency: 19, earningsEstimate: 9.48,
    hashboards: [
      { id: "HB1", status: "OK", temp: 64, chips: 110, chipTotal: 110 },
      { id: "HB2", status: "Warning", temp: 65, chips: 92, chipTotal: 110 },
      { id: "HB3", status: "OK", temp: 63, chips: 110, chipTotal: 110 },
    ],
    powerMode: "Normal", targetFreq: 620, targetVoltage: 14.8, fanMode: "Auto",
    sparkline: sparkM(85, 15),
  },
  {
    id: "m10", name: "Rack-D-01", model: "WhatsMiner M30S++", ip: "192.168.1.131", mac: "AA:BB:CC:04:01:01",
    serial: "SN-M30S-02104", firmware: "v20231201.1.2", status: "Online",
    hashrate: 108.9, hashrateUnit: "TH/s", avgHashrate24h: 108.2,
    boardTemps: [59, 61, 60], chipTemps: [73, 76, 74], fanSpeeds: [3900, 4000],
    powerDraw: 3380, efficiency: 31.0, pool: "f2pool", algorithm: "SHA-256",
    worker: "farm01.rack_d_01", uptime: "35d 6h 49m", lastSeen: "Just now",
    acceptedShares: 1482310, rejectedShares: 1023, poolLatency: 15, earningsEstimate: 12.68,
    hashboards: [
      { id: "HB1", status: "OK", temp: 59, chips: 148, chipTotal: 148 },
      { id: "HB2", status: "OK", temp: 61, chips: 148, chipTotal: 148 },
      { id: "HB3", status: "OK", temp: 60, chips: 148, chipTotal: 148 },
    ],
    powerMode: "Normal", targetFreq: 580, targetVoltage: 14.2, fanMode: "Auto",
    sparkline: sparkM(109, 4),
  },
];

export const minerAlerts: MinerAlert[] = [
  { id: "a1", time: "2024-03-10 14:22", minerName: "Rack-C-01", minerId: "m7", severity: "Critical", type: "Overheating", description: "Chip temperature exceeded 95°C threshold on board HB2", status: "Active" },
  { id: "a2", time: "2024-03-10 14:18", minerName: "Rack-A-02", minerId: "m2", severity: "Warning", type: "Low Hashrate", description: "Hashrate dropped 7% below expected. Board HB2 shows 5 missing chips.", status: "Active" },
  { id: "a3", time: "2024-03-10 13:55", minerName: "Rack-B-02", minerId: "m5", severity: "Critical", type: "Miner Offline", description: "Miner not responding. Last seen 2h 14m ago.", status: "Active" },
  { id: "a4", time: "2024-03-10 13:40", minerName: "Rack-C-02", minerId: "m8", severity: "Info", type: "Reboot", description: "Manual reboot initiated by operator.", status: "Acknowledged" },
  { id: "a5", time: "2024-03-10 12:30", minerName: "Rack-C-03", minerId: "m9", severity: "Warning", type: "High Reject Rate", description: "Share rejection rate at 1.8%, above 1% threshold.", status: "Active" },
  { id: "a6", time: "2024-03-10 11:05", minerName: "Rack-C-01", minerId: "m7", severity: "Warning", type: "Fan Speed", description: "Fans running at maximum RPM. Check airflow and ambient temperature.", status: "Acknowledged" },
  { id: "a7", time: "2024-03-10 08:12", minerName: "Rack-A-01", minerId: "m1", severity: "Info", type: "Pool Switch", description: "Automatically switched to backup pool due to primary latency spike.", status: "Resolved" },
  { id: "a8", time: "2024-03-09 22:30", minerName: "Rack-D-01", minerId: "m10", severity: "Info", type: "Firmware", description: "Firmware update v2024.03.2 available.", status: "Active" },
];

export const minerProfiles: MinerProfile[] = [
  { id: "p1", name: "Balanced", description: "Default balanced mode for daily operation.", freqTarget: 600, fanPolicy: "Auto", expectedHashrate: 110, expectedPower: 3250, thermalTarget: 75, powerMode: "Normal" },
  { id: "p2", name: "Turbo", description: "Maximum performance with higher power and thermals.", freqTarget: 680, fanPolicy: "Max", expectedHashrate: 135, expectedPower: 3800, thermalTarget: 85, powerMode: "High Performance" },
  { id: "p3", name: "Low Power", description: "Reduced power consumption for high electricity cost periods.", freqTarget: 480, fanPolicy: "Auto", expectedHashrate: 82, expectedPower: 2400, thermalTarget: 70, powerMode: "Eco" },
  { id: "p4", name: "Silent Night", description: "Minimum noise for overnight or residential operation.", freqTarget: 420, fanPolicy: "Quiet", expectedHashrate: 68, expectedPower: 2100, thermalTarget: 65, powerMode: "Eco" },
  { id: "p5", name: "Max Efficiency", description: "Best J/TH ratio for maximum profitability per watt.", freqTarget: 520, fanPolicy: "Auto", expectedHashrate: 92, expectedPower: 2600, thermalTarget: 72, powerMode: "Efficiency" },
];

export const minerPools: MinerPool[] = [
  { id: "pool1", name: "F2Pool", url: "stratum+tcp://btc.f2pool.com:3333", algorithm: "SHA-256", assignedMiners: 5, health: "Connected", priority: 1 },
  { id: "pool2", name: "Braiins Pool", url: "stratum+tcp://stratum.braiins.com:3333", algorithm: "SHA-256", assignedMiners: 3, health: "Connected", priority: 2 },
  { id: "pool3", name: "Litecoin Pool", url: "stratum+tcp://litecoinpool.org:3333", algorithm: "Scrypt", assignedMiners: 1, health: "Connected", priority: 1 },
  { id: "pool4", name: "NiceHash", url: "stratum+tcp://sha256.auto.nicehash.com:9200", algorithm: "SHA-256", assignedMiners: 0, health: "Disconnected", priority: 3 },
];

export const fleetHashrateHistory = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, "0")}:00`,
  hashrate: 680 + Math.random() * 40 + (i > 6 && i < 22 ? 20 : -10),
}));

export const fleetPowerHistory = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, "0")}:00`,
  power: 22000 + Math.random() * 2000 + (i > 6 && i < 22 ? 500 : -500),
}));

export const fleetTempHistory = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, "0")}:00`,
  avgTemp: 68 + Math.random() * 8 + (i > 12 && i < 18 ? 4 : 0),
}));
