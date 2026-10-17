import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const endpoint = process.env.APP_EVENTS_REALTIME_UI_URL;
test('local DB hint reaches the actual browser consumer on one socket without navigation', {
  skip: process.env.APP_EVENTS_REALTIME_SMOKE !== '1' || !endpoint,
  timeout: 90000,
}, async () => {
  const local = value => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
  assert.ok(local(endpoint));
  assert.ok(local(process.env.LOCAL_SUPABASE_DB_URL));
  const health = await (await fetch(`${endpoint}/api/health?deep=1`)).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.database.target, 'local');
  assert.equal(health.qaSource.mode, 'preview');
  const require = createRequire(new URL('../../apps/ui/package.json', import.meta.url));
  const {chromium} = require('@playwright/test');
  const {Pool} = require('pg');
  const db = new Pool({connectionString: process.env.LOCAL_SUPABASE_DB_URL});
  const browser = await chromium.launch({headless: true});
  let owner, original, modified = false;
  try {
    const page = await browser.newPage();
    let sockets = 0, hints = 0, navigations = 0;
    const joined = new Set();
    page.on('websocket', socket => {
      if (!socket.url().includes('/realtime/v1/websocket')) return;
      sockets++;
      socket.on('framereceived', frame => {
        const raw = String(frame.payload);
        if (raw.includes('account.changed')) hints++;
        try {
          const message = JSON.parse(raw);
          if (message.event === 'phx_reply' && message.payload?.status === 'ok') joined.add(message.topic);
        } catch { /* Ignore non-JSON transport frames. Never log credentials/frames. */ }
      });
    });
    await page.goto(`${endpoint}/dev/test-login?redirectTo=/`);
    await page.waitForURL(`${endpoint}/`, {timeout: 60000});
    owner = await page.evaluate(() => Object.keys(localStorage)
      .filter(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
      .map(key => JSON.parse(localStorage.getItem(key))?.user?.id).find(Boolean));
    assert.ok(owner);
    const state = await db.query('select practice_palette from public.user_settings where user_id=$1', [owner]);
    assert.equal(state.rowCount, 1);
    original = state.rows[0].practice_palette;
    await page.waitForFunction(value => document.querySelector('[data-account-palette]')?.getAttribute('data-account-palette') === value, original, {timeout: 10000});
    const deadline = Date.now() + 10000;
    while (!joined.has(`realtime:app:user:${owner}`) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(joined.has(`realtime:app:user:${owner}`), 'User topic must actually subscribe before the test mutation');
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    const next = original === 'blue' ? 'lavender' : 'blue';
    const started = Date.now();
    await db.query('update public.user_settings set practice_palette=$1 where user_id=$2', [next, owner]);
    modified = true;
    await page.waitForFunction(value => document.querySelector('[data-account-palette]')?.getAttribute('data-account-palette') === value, next, {timeout: 10000});
    assert.equal(navigations, 0);
    assert.equal(sockets, 1);
    assert.ok(hints > 0);
    console.log(JSON.stringify({result: 'PASS', elapsedMs: Date.now() - started, realtimeSockets: sockets, accountHints: hints, documentNavigations: navigations}));
  } finally {
    if (modified) await db.query('update public.user_settings set practice_palette=$1 where user_id=$2', [original, owner]);
    await browser.close();
    await db.end();
  }
});
