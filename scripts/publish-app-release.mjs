#!/usr/bin/env node
// Called only after exact commit/DB/worker health verification in deploy-nuc.
import { readFile } from 'node:fs/promises';
import process from 'node:process';

export async function publishAppRelease({ commit, envFile = '.env', request = fetch, environment = process.env }) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('An exact release commit is required');
  const values = {};
  for (const line of (await readFile(envFile, 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  const endpoint = environment.NEXT_PUBLIC_SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL || environment.SUPABASE_URL || values.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY || environment.SUPABASE_SECRET_KEY || values.SUPABASE_SERVICE_ROLE_KEY || values.SUPABASE_SECRET_KEY;
  if (!endpoint || !key) throw new Error('Release publication requires Supabase server credentials');
  const response = await request(`${endpoint.replace(/\/$/, '')}/rest/v1/rpc/publish_app_release_v1`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_commit: commit }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Release hint publication HTTP ${response.status}`);
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    await publishAppRelease({ commit: process.argv[2], envFile: process.argv[3] ?? '.env' });
    console.log('Release availability hint published');
  } catch {
    // A missed hint must not roll back a healthy release; focus/reconnect fetch recovers.
    // Deliberately omit exception text so endpoints/credentials never reach deployment logs.
    console.warn('Release availability hint could not be published; reconnect reconciliation remains available');
  }
}
