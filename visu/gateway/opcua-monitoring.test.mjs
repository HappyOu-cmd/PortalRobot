import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { monitoringIntervals, monitoringTier, monitoringBatches, initializeMonitoring, monitoringSummary } from './opcua-monitoring.mjs';

test('coordinates and command acknowledgements stay fast; large settings and inventory do not', () => {
  for (const path of ['lrActualX', 'lrActualY', 'lrActualZ', 'astAxisHmiStatus[2].lrActualPosition',
    'udiHmiCommandClockMs', 'udiPointEditorAckSeq', 'audiGeometryStopAck[1]', 'audiHmiSettingAck[2]']) {
    assert.equal(monitoringTier(path), 'fast', path);
  }
  for (const path of ['stCellStatus.xRunning', 'astGeometryStatus[1].xRecoveryRequired',
    'astMachineIoStatus[2].xDoorOpen', 'xPointEditorSaveAllowed']) assert.equal(monitoringTier(path), 'status', path);
  for (const path of ['stTestScenario.aauiSlotContent[1,120]', 'astPointEditorPoints[14].X',
    'astTwinConfig[2].lrVelocity', 'stTwinRequest.Config.lrWorkP1']) assert.equal(monitoringTier(path), 'bulk', path);
  for (const path of ['astTwinStore[1].astPallet[2].aSlots[96].eDetailType',
    'astMagazineSlot[2].uiProductType', 'newOptionalTag']) assert.equal(monitoringTier(path), 'normal', path);
});

test('sampling environment remains ordered and invalid values use finite defaults', () => {
  assert.deepEqual(monitoringIntervals({}), { fast: 100, status: 100, normal: 250, bulk: 1000 });
  assert.deepEqual(monitoringIntervals({ OPCUA_SAMPLING_MS: '500' }), { fast: 500, status: 500, normal: 500, bulk: 1000 });
  assert.deepEqual(monitoringIntervals({ OPCUA_SAMPLING_MS: 'NaN', OPCUA_STATUS_SAMPLING_MS: '-1',
    OPCUA_NORMAL_SAMPLING_MS: 'Infinity', OPCUA_BULK_SAMPLING_MS: '0' }), { fast: 100, status: 100, normal: 250, bulk: 1000 });
});

test('mixed large address space preserves every entry and reduces the requested sampling work', () => {
  const entries = [['lrActualX', 1], ['udiPointEditorAckSeq', 2], ['stCellStatus.xRunning', 3],
    ...Array.from({ length: 3000 }, (_, i) => [`stTestScenario.aValues[${i}]`, i + 10]),
    ...Array.from({ length: 2000 }, (_, i) => [`astTwinStore[1].aSlots[${i}].uiProductType`, i + 4000])];
  const batches = monitoringBatches(entries, monitoringIntervals({}));
  assert.equal(batches[0].tier, 'fast');
  assert.ok(batches.every(batch => batch.entries.length <= 50));
  assert.deepEqual(new Map(batches.flatMap(batch => batch.entries)), new Map(entries));
  const summary = monitoringSummary(batches, [], 50);
  assert.equal(summary.items, entries.length);
  assert.equal(summary.tiers.bulk.items, 3000);
  assert.ok(summary.estimatedRequestedSamplesPerSecond < entries.length * 20 / 8);
});

test('CreateMonitoredItems batches initialize in sequence and retain notifications during setup', async () => {
  const batches = monitoringBatches([['lrActualX', 1], ['stCellStatus.xRunning', 2]], monitoringIntervals({}));
  let pending = 0;
  let maxPending = 0;
  const seen = [];
  const groups = await initializeMonitoring(batches, batch => {
    const group = new EventEmitter();
    maxPending = Math.max(maxPending, ++pending);
    setImmediate(() => {
      group.emit('changed', null, 42, 0);
      pending -= 1;
      group.emit('initialized');
    });
    return group;
  }, (path, value) => seen.push([path, value]));
  assert.equal(maxPending, 1);
  assert.equal(groups.length, 2);
  assert.deepEqual(seen, [['lrActualX', 42], ['stCellStatus.xRunning', 42]]);
});

test('server rejection stops setup before another group and never reports success', async () => {
  const batches = monitoringBatches([['lrActualX', 1], ['newOptionalTag', 2]], monitoringIntervals({}));
  let created = 0;
  await assert.rejects(initializeMonitoring(batches, () => {
    created += 1;
    const group = new EventEmitter();
    group.monitoredItems = [{ statusCode: { isGood: () => false, toString: () => 'BadTooManyMonitoredItems' } }];
    setImmediate(() => group.emit('initialized'));
    return group;
  }, () => {}), /lrActualX: BadTooManyMonitoredItems/);
  assert.equal(created, 1);
});

test('transport errors and initialization timeout propagate without leaving setup pending', async () => {
  const batches = monitoringBatches([['lrActualX', 1]], monitoringIntervals({}));
  await assert.rejects(initializeMonitoring(batches, () => {
    const group = new EventEmitter();
    setImmediate(() => group.emit('err', 'BadSessionClosed'));
    return group;
  }, () => {}), /BadSessionClosed/);
  await assert.rejects(initializeMonitoring(batches, () => new EventEmitter(), () => {}, { timeoutMs: 5 }), /timed out/);
});

test('health summary reports server-revised sampling intervals separately from requested work', () => {
  const batches = monitoringBatches([['lrActualX', 1], ['lrActualY', 2]], monitoringIntervals({}));
  const summary = monitoringSummary(batches, [{ monitoredItems: [
    { monitoringParameters: { samplingInterval: 100 } }, { monitoringParameters: { samplingInterval: 200 } },
  ] }], 100);
  assert.equal(summary.publishingIntervalMs, 100);
  assert.deepEqual(summary.tiers.fast, { items: 2, requestedSamplingIntervalMs: 100,
    revisedMinSamplingIntervalMs: 100, revisedMaxSamplingIntervalMs: 200 });
  assert.equal(summary.estimatedRevisedSamplesPerSecond, 15);
});
