#!/usr/bin/env node

import process from "node:process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const options = {
    procRoot: "/proc",
    durationMs: 20_000,
    intervalMs: 250,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--proc-root") options.procRoot = value;
    else if (arg === "--duration-ms") options.durationMs = Number.parseInt(value, 10);
    else if (arg === "--interval-ms") options.intervalMs = Number.parseInt(value, 10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isSafeInteger(options.durationMs) || options.durationMs < 1_000 || options.durationMs > 120_000) {
    throw new Error("--duration-ms must be between 1000 and 120000");
  }
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 100 || options.intervalMs > 10_000) {
    throw new Error("--interval-ms must be between 100 and 10000");
  }
  return options;
}

function parseCpuLine(text) {
  const line = text.split(/\r?\n/).find((value) => value.startsWith("cpu "));
  if (!line) throw new Error("/proc/stat returned no aggregate cpu row");
  const values = line.trim().split(/\s+/).slice(1, 9).map(Number);
  if (values.length !== 8 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("/proc/stat aggregate cpu row is malformed");
  }
  const [user, nice, system, idle, iowait, irq, softirq, steal] = values;
  return { user, nice, system, idle, iowait, irq, softirq, steal };
}

function parseLoad(text) {
  const [load1, load5, load15] = text.trim().split(/\s+/).slice(0, 3).map(Number);
  if (![load1, load5, load15].every(Number.isFinite)) throw new Error("/proc/loadavg is malformed");
  return { load1, load5, load15 };
}

function parseMeminfo(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(MemTotal|MemAvailable|SwapFree):\s+(\d+)\s+kB$/.exec(line);
    if (match) values[match[1]] = Number(match[2]);
  }
  if (!Number.isFinite(values.MemTotal) || !Number.isFinite(values.MemAvailable)) {
    throw new Error("/proc/meminfo lacks MemTotal or MemAvailable");
  }
  return {
    totalKb: values.MemTotal,
    availableKb: values.MemAvailable,
    swapFreeKb: values.SwapFree ?? null,
  };
}

function parsePressure(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(some|full)\s+avg10=([0-9.]+)/.exec(line);
    if (match) result[match[1]] = Number(match[2]);
  }
  return result;
}

function cpuWindow(previous, current) {
  if (!previous) return null;
  const deltas = Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value - previous[key]]));
  const total = Object.values(deltas).reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return null;
  const percent = (value) => Math.round((value / total) * 1000) / 10;
  return {
    user: percent(deltas.user + deltas.nice),
    system: percent(deltas.system + deltas.irq + deltas.softirq),
    idle: percent(deltas.idle),
    iowait: percent(deltas.iowait),
    steal: percent(deltas.steal),
  };
}

export async function readHostSnapshot(procRoot = "/proc", previousCpu = null) {
  const [stat, loadavg, meminfo, cpuPressure, ioPressure] = await Promise.all([
    readFile(path.join(procRoot, "stat"), "utf8"),
    readFile(path.join(procRoot, "loadavg"), "utf8"),
    readFile(path.join(procRoot, "meminfo"), "utf8"),
    readFile(path.join(procRoot, "pressure", "cpu"), "utf8").catch(() => ""),
    readFile(path.join(procRoot, "pressure", "io"), "utf8").catch(() => ""),
  ]);
  const cpu = parseCpuLine(stat);
  return {
    cpu,
    cpuWindow: cpuWindow(previousCpu, cpu),
    load: parseLoad(loadavg),
    memory: parseMeminfo(meminfo),
    pressure: {
      cpu: parsePressure(cpuPressure),
      io: parsePressure(ioPressure),
    },
  };
}

export async function collectHost(options, now = () => new Date().toISOString()) {
  const deadline = Date.now() + options.durationMs;
  let previousCpu = null;
  let sampleNumber = 0;
  while (Date.now() < deadline) {
    sampleNumber += 1;
    const observedAt = now();
    const snapshot = await readHostSnapshot(options.procRoot, previousCpu);
    previousCpu = snapshot.cpu;
    delete snapshot.cpu;
    process.stdout.write(`scheduler-host-sample-${sampleNumber} observed_at=${observedAt} metrics=${JSON.stringify(snapshot)}\n`);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(options.intervalMs, remaining)));
  }
  return sampleNumber;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  collectHost(parseArgs(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`scheduler-host-sampler: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
