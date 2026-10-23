import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { createApp, type AppServices } from '../src/app.js';
import { loadAccessConfig } from '../src/lib/access.js';

const env = {
  MONITOR_ADMIN_USERNAME: 'fixture-admin',
  MONITOR_ADMIN_PASSWORD: 'fixture-admin-credential-'.repeat(3),
  MONITOR_JOB_TOKEN: 'fixture-job-credential-'.repeat(3),
  MONITOR_PUBLIC_ORIGIN: 'https://monitor.example.invalid',
};
const config = loadAccessConfig(env);
const basic = 'Basic ' + Buffer.from(`${env.MONITOR_ADMIN_USERNAME}:${env.MONITOR_ADMIN_PASSWORD}`).toString('base64');
const bearer = 'Bearer ' + env.MONITOR_JOB_TOKEN;

function fixture() {
  const calls = { stats: 0, logs: 0, monitor: [] as boolean[] };
  const services: AppServices = {
    stats() { calls.stats++; return { channelCount: 2, lastCheck: null }; },
    logs() {
      calls.logs++;
      return [{ id: 1, checked_at: '2026-01-01', channels_checked: 2, alerts_sent: 1, status: 'partial',
        error_message: 'PRIVATE_ERROR_FIXTURE', extra: 'PRIVATE_EXTRA_FIXTURE', channel_details: JSON.stringify({
          inactive: [{ studentName: 'PRIVATE_NAME_FIXTURE', studentId: 'PRIVATE_ID_FIXTURE', memoUrl: 'https://private.example.invalid' }],
          errors: [{ error: 'PRIVATE_ERROR_FIXTURE' }],
        }) }];
    },
    async monitor(testMode) {
      calls.monitor.push(testMode);
      return { channelsChecked: 2, alertsSent: testMode ? 0 : 1, errors: ['PRIVATE_ERROR_FIXTURE'],
        inactiveChannels: [{ studentName: 'PRIVATE_NAME_FIXTURE' }] };
    },
  };
  return { app: createApp(config, services), calls };
}

test('required access settings fail closed without exposing configuration values', () => {
  for (const key of Object.keys(env)) {
    assert.throws(() => loadAccessConfig({ ...env, [key]: undefined }));
  }
  assert.throws(() => loadAccessConfig({ ...env, MONITOR_ADMIN_PASSWORD: 'short' }));
  assert.throws(() => loadAccessConfig({ ...env, MONITOR_JOB_TOKEN: env.MONITOR_ADMIN_PASSWORD }));
  assert.throws(() => loadAccessConfig({ ...env, MONITOR_PUBLIC_ORIGIN: 'http://public.example.invalid' }));
  assert.throws(() => loadAccessConfig({ ...env, MONITOR_PUBLIC_ORIGIN: 'https://monitor.example.invalid/path' }));
  assert.doesNotThrow(() => loadAccessConfig({ ...env, MONITOR_PUBLIC_ORIGIN: 'http://localhost:3000' }));
});

test('only health is public, all dashboard/data/execution routes reject anonymous requests before accessing services', async () => {
  const { app, calls } = fixture();
  assert.equal((await app.request('/health')).status, 200);
  for (const path of ['/', '/api/stats', '/api/logs', '/api/unknown', '/api/stats/', '/api/logs?limit=1000']) {
    const response = await app.request(path);
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('www-authenticate') || '', /^Basic /);
  }
  for (const path of ['/api/monitor/run', '/api/monitor/test', '/api/jobs/monitor']) {
    assert.equal((await app.request(path, { method: 'POST' })).status, 401);
  }
  assert.deepEqual(calls, { stats: 0, logs: 0, monitor: [] });
});

test('valid admin can view dashboard and summaries, invalid Basic credentials cannot', async () => {
  const { app } = fixture();
  for (const authorization of ['Basic !!!', 'Basic ' + Buffer.from('wrong:wrong').toString('base64')]) {
    assert.equal((await app.request('/api/stats', { headers: { authorization } })).status, 401);
  }
  const dashboard = await app.request('/', { headers: { authorization: basic } });
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert.ok(!html.includes(env.MONITOR_ADMIN_PASSWORD));
  assert.ok(!html.includes(env.MONITOR_JOB_TOKEN));
  assert.ok(html.includes('X-Monitor-Request'));
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Script(match[1]), 'dashboard inline scripts must remain valid after summary-only rendering');
  }
  assert.equal((await app.request('/api/stats', { headers: { authorization: basic } })).status, 200);
  const response = await app.request('/api/logs', { headers: { authorization: basic } });
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(!body.includes('PRIVATE_'));
  assert.ok(!body.includes('channel_details'));
  const data = JSON.parse(body);
  assert.equal(data.logs[0].inactive_count, 1);
  assert.equal(data.logs[0].error_count, 1);
});

test('admin mutations require custom request header and reject foreign origins', async () => {
  const { app, calls } = fixture();
  assert.equal((await app.request('/api/monitor/run', { method: 'POST', headers: { authorization: basic } })).status, 403);
  assert.equal((await app.request('/api/monitor/run', { method: 'POST', headers: {
    authorization: basic, 'X-Monitor-Request': '1', Origin: 'https://foreign.example.invalid',
  } })).status, 403);
  assert.deepEqual(calls.monitor, []);
  for (const [path, testMode] of [['/api/monitor/run', false], ['/api/monitor/test', true]] as const) {
    const response = await app.request(path, { method: 'POST', headers: {
      authorization: basic, 'X-Monitor-Request': '1', Origin: env.MONITOR_PUBLIC_ORIGIN,
    } });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes('PRIVATE_'));
    assert.equal(calls.monitor.at(-1), testMode);
  }
});

test('machine token can only invoke the job route and cannot read management data', async () => {
  const { app, calls } = fixture();
  for (const path of ['/', '/api/stats', '/api/logs']) {
    assert.equal((await app.request(path, { headers: { authorization: bearer } })).status, 403);
  }
  assert.equal((await app.request('/api/monitor/run', { method: 'POST', headers: { authorization: bearer } })).status, 403);
  assert.equal((await app.request('/api/jobs/monitor', { method: 'POST', headers: { authorization: basic } })).status, 401);
  assert.equal((await app.request('/api/jobs/monitor', { method: 'POST', headers: { authorization: 'Bearer wrong' } })).status, 401);
  const response = await app.request('/api/jobs/monitor', { method: 'POST', headers: { authorization: bearer } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { channelsChecked: 2, alertsSent: 1, errorCount: 1, inactiveCount: 1 });
  assert.deepEqual(calls, { stats: 0, logs: 0, monitor: [false] });
});

test('service failure does not return secret or personal information from exceptions', async () => {
  const app = createApp(config, { stats() { throw new Error('PRIVATE_ERROR_FIXTURE'); }, logs: () => [],
    async monitor() { throw new Error('PRIVATE_ERROR_FIXTURE'); } });
  const response = await app.request('/api/jobs/monitor', { method: 'POST', headers: { authorization: bearer } });
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes('PRIVATE_'));
  const stats = await app.request('/api/stats', { headers: { authorization: basic } });
  assert.equal(stats.status, 500);
  assert.ok(!(await stats.text()).includes('PRIVATE_'));
});
