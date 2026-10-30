import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, statSync, unlinkSync, rmdirSync, existsSync, readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControllerPlcBridge, controllerPlcPayload, controllerHardwareKey } from './controller-plc.mjs';
import { ControllerAlarmTracker } from './controller-alarms.mjs';
import { controllerLedState } from './controller-diagnostics.mjs';
import alarmCatalog from '../alarm-catalog.json' with { type: 'json' };

function outboxDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'portal-controller-outbox-'));
  t.after(() => {
    for (const name of ['queue.json', 'queue.json.tmp']) {
      const file = join(directory, name);
      if (existsSync(file)) {
        if (statSync(file).isDirectory()) rmdirSync(file);
        else unlinkSync(file);
      }
    }
    rmdirSync(directory);
  });
  return directory;
}

function state(led = '00', modules = [], now = 0) {
  const result = { status: 'online', observedAt: now, resources: { led: controllerLedState(led) },
    modules: { observedAt: now, error: null, data: modules }, error: null };
  result.alarms = new ControllerAlarmTracker().update(result, now);
  return result;
}
function transport(options = {}) {
  const values = { 'stControllerWebStatus.udiAckSeq': 0, 'stControllerWebRequest.udiSequence': 0, udiHmiCommandClockMs: 100 };
  const writes = [];
  const control = { online: true, rejectAt: null };
  const adapters = { available: () => control.online, read: async () => ({ ...values }),
    write: async (path, type, value) => {
      writes.push([path, type, value]);
      if (path === control.rejectAt) throw new Error('Связь прервана');
      values[path] = value;
    }, ...options };
  return { values, writes, control, adapters, bridge: new ControllerPlcBridge(adapters),
    ack() { values['stControllerWebStatus.udiAckSeq'] = values['stControllerWebRequest.udiSequence']; } };
}

test('all CPU codes have stable unique banks; 5C alone is WARNING and module codes retain their category', () => {
  const keys = alarmCatalog.controllerDiagnostics.cpuAlarmCodes.map((code) => controllerHardwareKey(`controller:led:${code}`));
  assert.equal(new Set(keys.map((key) => `${key.source}:${key.code}`)).size, 35);
  assert.ok(keys.every((key) => key.severity === 'alarm' && key.code >= 0 && key.code < 32));
  assert.equal(controllerHardwareKey('controller:led:5C').severity, 'warning');
  assert.equal(controllerHardwareKey('controller:led:5C:invalid').severity, 'alarm');
  assert.equal(controllerHardwareKey('controller:led:00:invalid').severity, 'alarm');
  assert.equal(controllerHardwareKey('controller:led:00'), null);
  assert.equal(controllerHardwareKey('controller:led:unknown'), null);
  assert.equal(controllerHardwareKey('controller:module:255:65535').code, 5);
  assert.equal(controllerHardwareKey('controller:module:0:0'), null);
});

test('current telemetry is fresh independently per section and 5C sets no alarm mask', () => {
  const memory = controllerPlcPayload(state('5C'), 0);
  assert.equal(memory.xMemoryCurrent, true);
  assert.equal(memory.dwCpuCurrent1 | memory.dwCpuCurrent2, 0);
  const partial = state('5B', [{ slot: 0, errorCode: 2 }]);
  assert.equal(controllerPlcPayload(partial, 11_000).xCpuValid, false);
  assert.equal(controllerPlcPayload(partial, 11_000).xModulesValid, true);
  partial.alarms[1].stale = true;
  assert.equal(controllerPlcPayload(partial, 11_000).xModulesValid, false);
});

test('payload is written before Seq, remains immutable until Ack and confirmed observations are not replayed', async () => {
  const f = transport(); f.bridge.observe(state('5B'));
  await f.bridge.flush(0);
  assert.equal(f.writes.at(-1)[0], 'stControllerWebRequest.udiSequence');
  const committed = structuredClone(f.bridge.frame);
  f.bridge.observe(state('00', [], 500));
  await f.bridge.flush(500);
  assert.deepEqual(f.bridge.frame, committed);
  assert.equal(f.bridge.pending.size, 1);
  f.ack();
  await f.bridge.flush(1_000);
  assert.equal(f.bridge.pending.size, 0);
  assert.equal(f.bridge.frame.payload.dwCpuObserved1, 0);
  assert.equal(f.bridge.frame.payload.dwCpuObserved2, 0);
});

test('errors detected during STOP are delivered with fresh current recovery after RUN', async () => {
  const f = transport(); f.control.online = false;
  f.bridge.observe(state('5B'));
  await f.bridge.flush(0);
  assert.equal(f.writes.length, 0);
  f.bridge.observe(state('00', [], 6_000));
  f.control.online = true;
  await f.bridge.flush(6_000);
  assert.ok(f.bridge.frame.payload.dwCpuObserved1 || f.bridge.frame.payload.dwCpuObserved2);
  assert.equal(f.bridge.frame.payload.dwCpuCurrent1 | f.bridge.frame.payload.dwCpuCurrent2, 0);
  assert.equal(f.bridge.frame.payload.xCpuValid, true);
});

test('reconnect retries the identical committed Seq instead of overwriting it with a different payload', async () => {
  const f = transport(); f.bridge.observe(state('5B'));
  f.control.rejectAt = 'stControllerWebRequest.udiSequence';
  await f.bridge.flush(0);
  const frame = structuredClone(f.bridge.frame);
  assert.equal(f.bridge.status.status, 'error');
  f.control.rejectAt = null;
  f.bridge.observe(state('25', [], 2_000));
  await f.bridge.flush(2_000);
  assert.deepEqual(f.bridge.frame, frame);
  f.ack();
  await f.bridge.flush(3_000);
  assert.equal(f.bridge.frame.sequence, frame.sequence + 1);
  assert.equal(f.bridge.pending.size, 1, 'a newly observed fault is retained after the preceding Ack');
});

test('a persisted ambiguous frame survives gateway restart without replay after its Ack', async (t) => {
  const directory = outboxDirectory(t);
  const statePath = join(directory, 'queue.json');
  const f = transport({ statePath }); f.bridge.observe(state('5B'));
  await f.bridge.flush(0);
  assert.ok(JSON.parse(readFileSync(statePath, 'utf8')).frame);
  f.ack();
  const restarted = new ControllerPlcBridge(f.adapters);
  restarted.observe(state('00', [], 3_000));
  await restarted.flush(3_000);
  assert.equal(restarted.pending.size, 0);
  assert.equal(restarted.frame.payload.dwCpuObserved1 | restarted.frame.payload.dwCpuObserved2, 0);
  assert.equal(restarted.frame.sequence, 2);
});

test('an unacknowledged frame left by a previous writer and a damaged outbox cannot be silently overwritten', async (t) => {
  const f = transport(); f.values['stControllerWebRequest.udiSequence'] = 27;
  f.bridge.observe(state()); await f.bridge.flush(0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.bridge.status.status, 'pending');
  const directory = outboxDirectory(t);
  const statePath = join(directory, 'queue.json'); writeFileSync(statePath, '{broken');
  const broken = transport({ statePath }); broken.bridge.observe(state());
  await broken.bridge.flush(0);
  assert.equal(broken.writes.length, 0);
  assert.equal(broken.bridge.status.status, 'error');
  assert.match(broken.bridge.status.error, /validate: INVALID_OUTBOX/);
  broken.bridge.observe(state('5B', [], 6_000));
  await broken.bridge.flush(6_000);
  assert.equal(broken.writes.length, 0);
  assert.equal(readFileSync(statePath, 'utf8'), '{broken');
  assert.equal(existsSync(`${statePath}.tmp`), false);
});

test('a faulty module disappearing after gateway restart cannot confirm recovery even after its alarm Ack', async (t) => {
  const statePath = join(outboxDirectory(t), 'queue.json');
  const f = transport({ statePath });
  f.bridge.observe(state('00', [{ slot: 7, errorCode: 2 }]));
  await f.bridge.flush(0); f.ack(); await f.bridge.flush(500);
  assert.equal(f.bridge.pending.size, 0);
  const restarted = new ControllerPlcBridge(f.adapters);
  restarted.observe(state('00', [], 3_000)); await restarted.flush(3_000);
  assert.equal(restarted.frame.payload.xModulesValid, false);
  f.ack(); await restarted.flush(3_500);
  restarted.observe(state('00', [{ slot: 7, errorCode: 0 }], 6_000)); await restarted.flush(6_000);
  assert.equal(restarted.frame.payload.xModulesValid, true);
  assert.equal(restarted.moduleFaults.size, 0);
});

test('a failed frame save blocks PLC writes and recovers only after the identical frame is persisted', async (t) => {
  const statePath = join(outboxDirectory(t), 'queue.json');
  const f = transport({ statePath }); f.bridge.observe(state('5B'));
  mkdirSync(`${statePath}.tmp`); // Simulate a filesystem failure at frame persistence.
  await f.bridge.flush(0);
  assert.equal(f.bridge.status.status, 'error');
  assert.match(f.bridge.status.error, /write: E[A-Z]+/);
  assert.equal(f.writes.length, 0);
  const frame = structuredClone(f.bridge.frame);
  const write = f.bridge.write;
  f.bridge.write = async (...args) => {
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')).frame, frame);
    return write(...args);
  };
  f.bridge.observe(state('25', [], 500));
  await f.bridge.flush(500);
  assert.equal(f.writes.length, 0);
  rmdirSync(`${statePath}.tmp`);
  await f.bridge.flush(999);
  assert.equal(f.writes.length, 0, 'a retry waits for its deadline');
  await f.bridge.flush(1_000);
  assert.equal(f.writes.length, 12);
  assert.deepEqual(f.bridge.frame, frame);
  assert.equal(f.bridge.storageError, null);
  assert.equal(f.bridge.pending.size, 2, 'new observations survive a blocked frame');
  f.ack(); f.bridge.write = write;
  await f.bridge.flush(2_000);
  assert.equal(f.bridge.pending.size, 1);
  assert.equal(f.bridge.frame.sequence, frame.sequence + 1);
  assert.ok(f.bridge.frame.payload.dwCpuObserved1 || f.bridge.frame.payload.dwCpuObserved2);
});

test('persistent save failures remain blocked and retries do not postpone their own deadline', async (t) => {
  const statePath = join(outboxDirectory(t), 'queue.json');
  const f = transport({ statePath }); f.bridge.observe(state('5B'));
  mkdirSync(`${statePath}.tmp`);
  await f.bridge.flush(0);
  await f.bridge.flush(1_000);
  assert.equal(f.bridge.nextStorageRetryAt, 2_000);
  rmdirSync(`${statePath}.tmp`);
  await f.bridge.flush(1_500);
  assert.equal(f.writes.length, 0);
  await f.bridge.flush(2_000);
  assert.equal(f.writes.length, 12);
  assert.equal(f.bridge.status.error, null);
});

test('a save failure during observation is retried without dropping detected faults', async (t) => {
  const statePath = join(outboxDirectory(t), 'queue.json');
  const f = transport({ statePath });
  mkdirSync(`${statePath}.tmp`);
  f.bridge.observe(state('5B'));
  await f.bridge.flush(0);
  assert.equal(f.writes.length, 0);
  f.bridge.observe(state('00', [], 500));
  rmdirSync(`${statePath}.tmp`);
  await f.bridge.flush(1_000);
  assert.ok(f.bridge.frame.payload.dwCpuObserved1 || f.bridge.frame.payload.dwCpuObserved2);
  assert.equal(f.bridge.frame.payload.dwCpuCurrent1 | f.bridge.frame.payload.dwCpuCurrent2, 0);
  assert.equal(f.bridge.status.error, null);
});

test('an Ack save failure recovers while idle without replaying the acknowledged fault', async (t) => {
  const statePath = join(outboxDirectory(t), 'queue.json');
  const f = transport({ statePath }); f.bridge.observe(state('5B'));
  await f.bridge.flush(0); f.ack();
  mkdirSync(`${statePath}.tmp`);
  await f.bridge.flush(500);
  assert.equal(f.bridge.status.status, 'error');
  assert.equal(f.bridge.frame, null);
  assert.ok(JSON.parse(readFileSync(statePath, 'utf8')).frame);
  rmdirSync(`${statePath}.tmp`);
  await f.bridge.flush(1_500);
  assert.equal(f.writes.length, 12);
  assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).frame, null);
  assert.equal(f.bridge.pending.size, 0);
  assert.equal(f.bridge.status.status, 'synchronized');
  assert.equal(f.bridge.status.error, null);
});

test('unchanged observations do not rewrite the outbox but changed module identities are saved', (t) => {
  const statePath = join(outboxDirectory(t), 'queue.json');
  const f = transport({ statePath }); f.bridge.observe(state());
  utimesSync(statePath, 1, 1);
  const modified = statSync(statePath).mtimeMs;
  f.bridge.observe(state('00', [], 3_000));
  assert.equal(statSync(statePath).mtimeMs, modified);
  f.bridge.observe(state('00', [{ slot: 7, errorCode: 2 }], 6_000));
  assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')).moduleFaults, [[7, 2]]);
});

test('a Windows reader temporarily blocking replacement cannot permanently disable delivery', { skip: process.platform !== 'win32' }, async (t) => {
  const statePath = join(outboxDirectory(t), 'queue.json');
  const f = transport({ statePath }); f.bridge.observe(state('5B'));
  const escaped = statePath.replaceAll("'", "''");
  const locker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$stream = [IO.File]::Open('${escaped}', [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read); try { [Console]::WriteLine('locked'); [Console]::ReadLine() | Out-Null } finally { $stream.Dispose() }`],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(locker, 'exit');
  try {
    const [ready] = await once(locker.stdout, 'data', { signal: AbortSignal.timeout(8_000) });
    assert.match(ready.toString(), /locked/);
    await f.bridge.flush(0);
    assert.match(f.bridge.status.error, /rename: (EPERM|EACCES|EBUSY)/);
    assert.equal(f.writes.length, 0);
  } finally {
    locker.stdin.end('\n');
    await exited;
  }
  const frame = structuredClone(f.bridge.frame);
  await f.bridge.flush(1_000);
  assert.equal(f.writes.length, 12);
  assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')).frame, frame);
  assert.equal(f.bridge.status.error, null);
});
