import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { GoogleSheetsClient } from '../src/lib/sheets.js';
import { createApp } from '../src/app.js';
import { loadAccessConfig } from '../src/lib/access.js';

// Use generated, disposable credentials only. Every HTTP transport is replaced
// before GoogleAuth creates a client; unexpected requests fail locally.
const require = createRequire(import.meta.url);
const commonRequire = createRequire(require.resolve('googleapis-common'));
const transports = new Set([
  require('gaxios').Gaxios.prototype,
  commonRequire('gaxios').Gaxios.prototype,
]);
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

for (const scenario of ['values', 'empty', 'failure'] as const) {
  test(`real GoogleAuth and Sheets wrapper use isolated transport: ${scenario}`, async (t) => {
    const calls: string[] = [];
    for (const transport of transports) {
      t.mock.method(transport, 'request', async (options: { url: string | URL }) => {
        const url = new URL(String(options.url));
        if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') {
          calls.push('token');
          return { data: { access_token: 'disposable-fixture-token', expires_in: 3600, token_type: 'Bearer' },
            status: 200, headers: new Headers(), config: options };
        }
        if (url.origin !== 'https://sheets.googleapis.com' ||
            !url.pathname.startsWith('/v4/spreadsheets/fixture-sheet/values/')) {
          throw new Error('Unexpected transport request blocked');
        }
        calls.push('sheet');
        if (scenario === 'failure') throw new Error('PRIVATE_ERROR_FIXTURE');
        return { data: scenario === 'empty' ? {} : { values: [['fixture-a', 'fixture-b']] },
          status: 200, headers: new Headers(), config: options };
      });
    }
    const client = new GoogleSheetsClient('fixture@example.invalid', privateKey.replace(/\n/g, '\\n'),
      'fixture-sheet', 'Fixture');
    if (scenario === 'failure') {
      // The wrapper preserves failure semantics. The access tests separately
      // verify that the app's error boundary never returns exception details.
      await assert.rejects(client.getSheetData(), { message: 'PRIVATE_ERROR_FIXTURE' });
      const config = loadAccessConfig({
        MONITOR_ADMIN_USERNAME: 'fixture-admin',
        MONITOR_ADMIN_PASSWORD: 'fixture-password-'.repeat(4),
        MONITOR_JOB_TOKEN: 'fixture-job-credential-'.repeat(3),
        MONITOR_PUBLIC_ORIGIN: 'https://monitor.example.invalid',
      });
      const app = createApp(config, {
        stats: () => ({ channelCount: 0, lastCheck: null }),
        logs: () => [],
        monitor: async () => { await client.getSheetData(); throw new Error('unreachable'); },
      });
      const response = await app.request('/api/jobs/monitor', {
        method: 'POST', headers: { Authorization: `Bearer ${'fixture-job-credential-'.repeat(3)}` },
      });
      assert.equal(response.status, 500);
      const body = await response.text();
      assert.equal(body.includes('PRIVATE_ERROR_FIXTURE'), false);
      assert.equal(body.includes('fixture@example.invalid'), false);
    } else {
      assert.deepEqual(await client.getSheetData(), scenario === 'empty' ? [] : [['fixture-a', 'fixture-b']]);
    }
    assert.ok(calls.includes('sheet'));
    assert.ok(calls.includes('token'));
  });
}
