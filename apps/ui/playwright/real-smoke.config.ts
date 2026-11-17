import { defineConfig } from '@playwright/test';

if (process.env.REAL_SMOKE !== '1' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.REAL_SMOKE_BASE_URL ?? '')) {
  throw new Error('Real smoke requires its isolated local harness');
}
export default defineConfig({
  testDir: './real-smoke', workers: 1, retries: 0, timeout: 180_000,
  reporter: 'line', use: { baseURL: process.env.REAL_SMOKE_BASE_URL, trace: 'off', screenshot: 'off', video: 'off' },
});
