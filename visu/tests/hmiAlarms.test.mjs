import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ControllerDiagnostics } from '../gateway/controller-diagnostics.mjs';
import { controllerHardwareKey } from '../gateway/controller-plc.mjs';
import alarmCatalog from '../alarm-catalog.json' with { type: 'json' };

const server = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: join(tmpdir(), 'portal-hmi-alarm-tests'), server: { middlewareMode: true, watch: null },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' } });
after(() => server.close());
const { controllerAlarmEvents, hmiAlarmSourceLabel, hmiAlarmEffectLabel, selectLatestActiveEvent,
  selectNewestReceivedEvent, alarmEventIdentity, controllerPlcAlarmKey, hasResettablePlcWarnings } = await server.ssrLoadModule('/src/plc/hmiAlarms.ts');
const { LatestEventNotification } = await server.ssrLoadModule('/src/components/LatestEventNotification.tsx');

const plcAlarm = (id, reportedAt, severity = 'alarm') => ({
  id, reportedAt, severity, effect: 'robot-stop', source: 'robot', code: 1, text: 'Ошибка робота', active: true,
});

test('MC522 exception reaches the existing HMI popup independently of OPC UA', async () => {
  const data = { resources: { led: '5B', runstate: '0' }, identity: { devicetype: 'MC522' }, modules: [] };
  const diagnostics = new ControllerDiagnostics({ enabled: true, url: 'http://localhost:8090' }, async (_, section) => data[section]);
  await diagnostics.poll(3_000);
  const events = controllerAlarmEvents(diagnostics.state, true);
  const selected = selectLatestActiveEvent(events); // No PLC alarm snapshot is available.
  assert.equal(selected.code, 'controller:led:5B');
  assert.equal(events.filter((event) => event.active && event.severity === 'alarm').length, 1);
  assert.match(hmiAlarmEffectLabel(selected), /передаётся в PLC/);
  const html = renderToStaticMarkup(createElement(LatestEventNotification, { event: selected,
    mechanism: hmiAlarmSourceLabel(selected), activeCount: 1, onCollapse() {} }));
  assert.match(html, /Авария HMI/);
  assert.match(html, /Контроллер \(HMI\)/);
  assert.match(html, /Код CPU 5B/);
  assert.match(html, /Исключение приложения/);
  assert.match(html, /aria-live="assertive"/);
});

test('gateway loss marks controller faults stale without hiding or clearing them', async () => {
  const data = { resources: { led: '25' }, identity: { devicetype: 'MC522' }, modules: [] };
  const diagnostics = new ControllerDiagnostics({ enabled: true, url: 'http://localhost:8090' }, async (_, section) => data[section]);
  await diagnostics.poll(0);
  const online = controllerAlarmEvents(diagnostics.state, true);
  const offline = controllerAlarmEvents(diagnostics.state, false);
  assert.equal(offline[0].active, true);
  assert.equal(offline[0].stale, true);
  assert.equal(online[0].stale, false);
  assert.equal(alarmEventIdentity(offline[0]), alarmEventIdentity(online[0]));
  assert.equal(selectLatestActiveEvent(offline).id, online[0].id);
});

test('mixed PLC and HMI events keep alarm priority, numeric PLC ordering and stable popup identity', () => {
  const warning = { id: 'controller:2000:1', source: 'controller', severity: 'warning', effect: 'notification',
    code: 'controller:web:offline', text: 'Нет диагностики', active: true, stale: false, reportedAt: 2_000 };
  const events = [plcAlarm(9, 1_000), plcAlarm(10, 1_000), warning];
  assert.equal(selectLatestActiveEvent(events).id, 10);
  assert.equal(selectNewestReceivedEvent(events).id, warning.id);
  assert.equal(hmiAlarmEffectLabel(events[0]), 'Останов робота');
  assert.equal(hmiAlarmSourceLabel(events[0]), 'Робот');
  assert.notEqual(alarmEventIdentity(warning), alarmEventIdentity({ ...warning, id: 'controller:3000:2', reportedAt: 3_000 }));
  assert.deepEqual(controllerAlarmEvents(undefined, true), []);
  assert.deepEqual(controllerAlarmEvents({}, true), []);
  assert.equal(selectLatestActiveEvent([{ ...warning, active: false }]), null);
});

test('HMI and gateway map identical CPU/module codes and remove a fallback only when the PLC alarm exists', async () => {
  for (const code of [...alarmCatalog.controllerDiagnostics.cpuAlarmCodes.map((value) => `controller:led:${value}`),
    'controller:led:5C', 'controller:led:00', 'controller:led:5C:invalid', 'controller:led:00:invalid',
    'controller:module:0:2', 'controller:module:255:65535']) {
    assert.deepEqual(controllerPlcAlarmKey(code), controllerHardwareKey(code));
  }
  const data = { resources: { led: '5B' }, identity: { devicetype: 'MC522' }, modules: [] };
  const diagnostics = new ControllerDiagnostics({ enabled: true, url: 'http://localhost:8090' }, async (_, section) => data[section]);
  await diagnostics.poll(0);
  const key = controllerHardwareKey('controller:led:5B');
  const registered = { ...plcAlarm(42, 100), ...key, effect: 'global-stop' };
  assert.equal(controllerAlarmEvents(diagnostics.state, true, []).length, 1);
  assert.equal(controllerAlarmEvents(diagnostics.state, true, [registered]).length, 0);
  assert.equal(controllerAlarmEvents(diagnostics.state, false, []).length, 1);
  assert.equal(controllerAlarmEvents(diagnostics.state, true, [{ ...registered, code: key.code + 1 }]).length, 1);
});

test('memory code 5C remains a warning in the direct HMI fallback', async () => {
  const data = { resources: { led: '5C' }, identity: { devicetype: 'MC522' }, modules: [] };
  const diagnostics = new ControllerDiagnostics({ enabled: true, url: 'http://localhost:8090' }, async (_, section) => data[section]);
  await diagnostics.poll(0);
  assert.equal(controllerAlarmEvents(diagnostics.state, true)[0].severity, 'warning');
});

test('5C reset indication follows only the PLC permission and does not block confirmation of other warnings', () => {
  const memory = { ...plcAlarm(1, 0, 'warning'), ...controllerHardwareKey('controller:led:5C'), effect: 'warning' };
  assert.equal(hasResettablePlcWarnings([memory], false), false);
  assert.equal(hasResettablePlcWarnings([memory], true), true);
  assert.equal(hasResettablePlcWarnings([memory, plcAlarm(2, 1, 'warning')], false), true);
});
