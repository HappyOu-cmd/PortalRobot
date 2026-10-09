import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateCandidates, prepareAggregateMonitoring } from './opcua-aggregate.mjs';
import { monitoringBatches, monitoringIntervals } from './opcua-monitoring.mjs';

const good = value => ({ statusCode: { isGood: () => true }, value: { value } });

test('aggregate values preserve published paths, declared bounds and original CODESYS field names', () => {
  const paths = ['astPointEditorPoints[2].X', 'astPointEditorPoints[4].Name'];
  const layout = { compounds: new Map([['astPointEditorPoints', 'points']]),
    bounds: new Map([['astPointEditorPoints', { lower: [0], upper: [4] }]]) };
  const [channel] = aggregateCandidates(layout, paths.map(path => [path, path]));
  const points = Array.from({ length: 5 }, (_, i) => ({ x: i * 10, name: `point${i}`,
    schema: { fields: [{ name: 'x', originalName: 'X' }, { name: 'name', originalName: 'Name' }] } }));
  assert.deepEqual(channel.expand(points), [[paths[0], 20], [paths[1], 'point4']]);
  assert.equal(channel.members.length, 2);
});

test('nested arrays and flat matrices use actual lower bounds in every dimension', () => {
  const layout = { compounds: new Map([['astStore', 'store'], ['stTestScenario', 'scenario']]),
    bounds: new Map([
      ['astStore', { lower: [1], upper: [1] }],
      ['astStore[1].slots', { lower: [-2], upper: [0] }],
      ['stTestScenario.aauiSlotContent', { lower: [0, -1], upper: [1, 1] }],
    ]) };
  const paths = ['astStore[1].slots[0].xOccupied', 'stTestScenario.aauiSlotContent[1,0]'];
  const channels = aggregateCandidates(layout, paths.map(path => [path, path]));
  assert.deepEqual(channels[0].expand([{ slots: [{ xOccupied: false }, { xOccupied: false }, { xOccupied: true }] }]), [[paths[0], true]]);
  assert.deepEqual(channels[1].expand({ aauiSlotContent: new Uint16Array([10, 11, 12, 20, 21, 22]) }), [[paths[1], 21]]);
});

test('one parent item inherits its fastest child rather than slowing coordinate feedback', () => {
  const path = 'astAxisHmiStatus[1].lrActualPosition';
  const layout = { compounds: new Map([['astAxisHmiStatus', 'axis']]),
    bounds: new Map([['astAxisHmiStatus', { lower: [1], upper: [3] }]]) };
  const channels = aggregateCandidates(layout, [[path, 'position']]);
  const batches = monitoringBatches(channels.map(c => [c.path, c.nodeId]), monitoringIntervals({}), 50,
    p => channels.find(c => c.path === p).tier);
  assert.equal(batches[0].tier, 'fast');
  assert.equal(batches[0].samplingIntervalMs, 100);
});

test('an unreadable parent or missing decoded member falls back without losing a logical field', async () => {
  const layout = { compounds: new Map([['stExample', 'parent']]), bounds: new Map() };
  const entries = [['stExample.xReady', 'ready'], ['stExample.uiCode', 'code']];
  for (const parent of [{ statusCode: { isGood: () => false } }, good({ xReady: true })]) {
    const reads = [];
    const result = await prepareAggregateMonitoring(layout, entries, async nodes => {
      reads.push(nodes); return nodes.map(n => n === 'parent' ? parent : good(n === 'ready' ? true : 7));
    });
    assert.deepEqual(result.initial, { 'stExample.xReady': true, 'stExample.uiCode': 7 });
    assert.deepEqual(result.fallbackRoots, ['stExample']);
    assert.deepEqual(reads, [['parent'], ['ready', 'code']]);
    assert.equal(result.channels.length, 2);
  }
});

test('missing bounds fall back to leaves, while a bad leaf read prevents a false connected state', async () => {
  const layout = { compounds: new Map([['astValues', 'parent']]), bounds: new Map() };
  const channels = aggregateCandidates(layout, [['astValues[9]', 'leaf']]);
  assert.equal(channels[0].nodeId, 'leaf');
  await assert.rejects(prepareAggregateMonitoring(layout, [['astValues[9]', 'leaf']], async () =>
    [{ statusCode: { isGood: () => false, toString: () => 'BadNotReadable' } }]), /BadNotReadable/);
});

test('thousands of array leaves share one parent item and retain the full initial snapshot', async () => {
  const entries = Array.from({ length: 3000 }, (_, i) => [`astValues[${i + 1}]`, i]);
  const layout = { compounds: new Map([['astValues', 'array']]),
    bounds: new Map([['astValues', { lower: [1], upper: [3000] }]]) };
  const result = await prepareAggregateMonitoring(layout, entries, async nodes => {
    assert.deepEqual(nodes, ['array']); return [{ ...good(Uint32Array.from({ length: 3000 }, (_, i) => i)), sourceTimestamp: new Date(123456) }];
  });
  assert.equal(result.channels.length, 1);
  assert.equal(Object.keys(result.initial).length, 3000);
  assert.equal(result.initial['astValues[3000]'], 2999);
  assert.equal(result.timestamps['astValues[3000]'], 123456);
  const next = Uint32Array.from({ length: 3000 }, (_, i) => i);
  next[2999] = 42;
  assert.deepEqual(result.channels[0].expand(next).at(-1), ['astValues[3000]', 42]);
  assert.equal(result.initial['astValues[3000]'], 2999);
});
