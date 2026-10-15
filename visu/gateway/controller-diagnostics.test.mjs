import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ControllerDiagnostics, controllerWebOptions, controllerLedState, normalizeControllerResources, parseControllerResponse, readControllerCgi } from './controller-diagnostics.mjs';

const resources = { cpu: 35, ram: 77, rom: 17, cputemp: 43, led: '00', runstate: '1', debugValue: '0', uptime: '0d:23h:11min', net0up: 28, net0down: 21 };
const identity = { devicetype: 'LicOS-PAC-MC522', devicename: 'MC522', softwareversion: 'V1.2.0.2', serialnumber: 'sample' };
const options = { enabled: true, url: 'http://127.0.0.1:8090', username: 'test-user', password: 'test-secret', error: null };
const response = (data, header = 'Content-type text/json') => Buffer.from(`HTTP/1.0 200 OK\r\n${header}\r\n\r\n${JSON.stringify({ error: false, data })}`);

async function localController(t, reply) {
  const sockets = new Set();
  const requests = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let request = '';
    let answered = false;
    socket.on('data', (chunk) => {
      request += chunk;
      if (!answered && request.includes('\r\n\r\n')) {
        answered = true;
        requests.push(request);
        reply(socket);
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

test('controller polling needs explicit credentials and rejects credentials in a URL', () => {
  assert.equal(controllerWebOptions('opc.tcp://192.0.2.1:4840', undefined, {}).enabled, false);
  const configured = controllerWebOptions('opc.tcp://192.0.2.1:4840', undefined, { CONTROLLER_WEB_USERNAME: 'test-user', CONTROLLER_WEB_PASSWORD: 'test-secret' });
  assert.equal(configured.enabled, true);
  assert.equal(configured.url, 'http://192.0.2.1:8090');
  assert.equal(controllerWebOptions('opc.tcp://192.0.2.1:4840', undefined, { CONTROLLER_WEB_URL: 'http://user:secret@localhost:8090' }).url, '');
  assert.equal(controllerWebOptions('opc.tcp://192.0.2.1:4840', undefined, { CONTROLLER_WEB_ENABLED: '0' }).enabled, false);
});

test('local settings load on the gateway and environment overrides them', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-controller-settings-test-'));
  const file = join(dir, 'controller-web.json');
  t.after(async () => { await unlink(file); await rmdir(dir); });
  await writeFile(file, JSON.stringify(options));
  const configured = controllerWebOptions('opc.tcp://localhost:4840', file, { CONTROLLER_WEB_USERNAME: 'override' });
  assert.equal(configured.username, 'override');
  assert.equal(configured.password, options.password);
  await writeFile(file, '{invalid');
  const invalid = controllerWebOptions('opc.tcp://localhost:4840', file, {});
  assert.equal(invalid.enabled, false);
  assert.equal(invalid.url, '');
});

test('actual firmware header without a colon and standard HTTP both decode', () => {
  assert.deepEqual(parseControllerResponse(response({ cpuinfo: resources }), 'cpuinfo'), resources);
  assert.deepEqual(parseControllerResponse(response({ cpuinfo: resources }, 'Content-Type: application/json'), 'cpuinfo'), resources);
  assert.throws(() => parseControllerResponse(Buffer.from('HTTP/1.0 401 Unauthorized\r\n\r\n'), 'cpuinfo'), { status: 'unauthorized' });
  assert.throws(() => parseControllerResponse(Buffer.from('HTTP/1.0 200 OK\r\nContent-Length: 100\r\n\r\n{}'), 'cpuinfo'), /Неполный/);
  assert.throws(() => parseControllerResponse(response({}), 'cpuinfo'), /Нет данных/);
  assert.throws(() => parseControllerResponse(Buffer.from('HTTP/1.0 200 OK\r\n\r\nnot-json'), 'cpuinfo'), /некорректный JSON/);
});

test('network transport uses only an allowlisted GET and accepts fragmented legacy responses', async (t) => {
  const raw = response({ cpuinfo: resources });
  const controller = await localController(t, (socket) => {
    socket.write(raw.subarray(0, 43));
    socket.end(raw.subarray(43));
  });
  assert.deepEqual(await readControllerCgi({ ...options, url: controller.url }, 'resources'), resources);
  assert.match(controller.requests[0], /^GET \/cgi-bin\/system\?key=cpuinfo HTTP\/1\.0\r\n/);
  assert.match(controller.requests[0], /Connection: close/);
  assert.match(controller.requests[0], new RegExp(`Authorization: Basic ${Buffer.from('test-user:test-secret').toString('base64')}`));
  await assert.rejects(readControllerCgi({ ...options, url: controller.url }, 'reboot'), /Недопустимый/);
  assert.equal(controller.requests.length, 1);
});

test('requests terminate on timeout and oversized responses', async (t) => {
  const stalled = await localController(t, () => {});
  await assert.rejects(readControllerCgi({ ...options, url: stalled.url, timeoutMs: 50 }, 'resources'), /не ответил/);
  const oversized = await localController(t, (socket) => socket.end(Buffer.alloc(256 * 1024 + 1)));
  await assert.rejects(readControllerCgi({ ...options, url: oversized.url }, 'resources'), /Слишком большой/);
});

test('missing and invalid sensor values never fabricate zero, RUN, or healthy LED state', () => {
  const normalized = normalizeControllerResources({ cpu: null, ram: ' ', rom: 101, cputemp: false, runstate: 2 });
  assert.equal(normalized.cpuLoadPercent, null);
  assert.equal(normalized.memoryUsedPercent, null);
  assert.equal(normalized.storageUsedPercent, null);
  assert.equal(normalized.temperatureCelsius, null);
  assert.equal(normalized.applicationRunning, null);
  assert.equal(normalized.led.normal, null);
  assert.equal(controllerLedState('00').normal, true);
  assert.equal(controllerLedState('5b').message, 'Исключение приложения: проверьте журнал CODESYS');
  assert.deepEqual(controllerLedState('7e'), { code: '7E', message: 'Неизвестный код производителя', normal: false });
  assert.throws(() => normalizeControllerResources({}), /Некорректные/);
});

test('resource, module and identity polling have separate cadences and never publish credentials', async () => {
  const calls = [];
  const data = { resources, identity, modules: [{ slave: 0, type: 15, error: 0 }] };
  const diagnostics = new ControllerDiagnostics(options, async (_, section) => { calls.push(section); return data[section]; });
  const first = await diagnostics.poll(0);
  assert.equal(first.status, 'online');
  assert.equal(first.resources.cpuLoadPercent, 35);
  assert.equal(first.resources.debugMode, false);
  assert.equal(first.modules.data[0].message, 'Ошибок нет');
  assert.doesNotMatch(JSON.stringify(first), /test-secret|test-user|password|username/);
  calls.length = 0;
  await diagnostics.poll(3_000);
  assert.deepEqual(calls, ['resources']);
  calls.length = 0;
  await diagnostics.poll(6_000);
  assert.deepEqual(calls, ['resources', 'modules']);
  calls.length = 0;
  await diagnostics.poll(60_000);
  assert.deepEqual(calls, ['resources', 'identity', 'modules']);
});

test('partial failures preserve fresh resources, failed CPU reads clear all previous metrics', async () => {
  let cpuFail = false;
  const diagnostics = new ControllerDiagnostics(options, async (_, section) => {
    if (section === 'identity') throw new Error('Паспорт недоступен');
    if (section === 'modules') return [{ slave: 0, type: 15, error: 2 }];
    if (cpuFail) { const error = new Error('Авторизация отклонена'); error.status = 'unauthorized'; throw error; }
    return resources;
  });
  const first = await diagnostics.poll(0);
  assert.equal(first.status, 'online');
  assert.equal(first.identity.error, 'Паспорт недоступен');
  assert.equal(first.identity.data, null);
  assert.equal(first.modules.data[0].message, 'Ошибка питания');
  cpuFail = true;
  const second = await diagnostics.poll(3_000);
  assert.equal(second.status, 'unauthorized');
  assert.equal(second.resources, null);
  assert.equal(second.observedAt, null);
  assert.equal(first.resources.cpuLoadPercent, 35);
});

test('disabled diagnostics do not open any controller connection', async () => {
  const diagnostics = new ControllerDiagnostics({ enabled: false, url: '', error: null }, () => assert.fail('Unexpected connection'));
  assert.equal((await diagnostics.poll(0)).status, 'disabled');
});
