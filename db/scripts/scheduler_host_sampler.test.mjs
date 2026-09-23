import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readHostSnapshot } from "./scheduler_host_sampler.mjs";

test("reads bounded aggregate host metrics without process or command details", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "scheduler-host-sampler-"));
  await mkdir(path.join(root, "pressure"));
  await writeFile(path.join(root, "stat"), "cpu  100 20 30 800 10 2 3 1\nprocesses 1\n");
  await writeFile(path.join(root, "loadavg"), "0.25 0.50 0.75 1/100 123\n");
  await writeFile(path.join(root, "meminfo"), "MemTotal:       2048000 kB\nMemAvailable:   1024000 kB\nSwapFree:        512000 kB\n");
  await writeFile(path.join(root, "pressure", "cpu"), "some avg10=1.25 avg60=2.00 avg300=3.00 total=4\nfull avg10=0.50 avg60=1.00 avg300=1.50 total=2\n");
  await writeFile(path.join(root, "pressure", "io"), "some avg10=0.75 avg60=1.00 avg300=1.25 total=3\nfull avg10=0.25 avg60=0.50 avg300=0.75 total=1\n");

  const snapshot = await readHostSnapshot(root, {
    user: 90, nice: 20, system: 25, idle: 790, iowait: 9, irq: 2, softirq: 3, steal: 1,
  });
  assert.deepEqual(snapshot.load, { load1: 0.25, load5: 0.5, load15: 0.75 });
  assert.deepEqual(snapshot.memory, { totalKb: 2048000, availableKb: 1024000, swapFreeKb: 512000 });
  assert.deepEqual(snapshot.pressure.cpu, { some: 1.25, full: 0.5 });
  assert.equal(snapshot.cpuWindow.user, 38.5);
  assert.equal(snapshot.cpuWindow.idle, 38.5);
  assert.equal(snapshot.cpuWindow.iowait, 3.8);
  assert.equal("processes" in snapshot, false);
  assert.equal("query" in snapshot, false);
});
