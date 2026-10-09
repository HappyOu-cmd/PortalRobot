import assert from 'node:assert/strict';
import test from 'node:test';
import { PointEditorRequests } from '../src/plc/pointEditorRequests.ts';
import type { PlcPointEditorCommand } from '../src/plc/pointEditorRequests.ts';

const capture = (index = 13): PlcPointEditorCommand => ({ command: 'robot.point.capture', index });
const point = (x = 8381.11) => ({ x, y: -76.9032, z: 1234.8308, magazineSafeZ: -300, magazineChangeZ: 0, speedFactor: 1, configured: false });
const reply = (sequence = 8, index = 13) => ({ sequence, index, command: 'robot.point.capture' as const, point: point() });

test('CAPTURE waits for its own complete reply while old ACKs and XYZ telemetry arrive', async () => {
  const requests = new PointEditorRequests();
  let draft = point(3030.9016);
  const pending = requests.run('capture-8', capture(), () => {}).then(result => { draft = result.point; });
  assert.equal(requests.receive({ requestId: 'capture-7', ok: true, pointEditor: { ...reply(7), point: point(3030.9016) } }), false);
  await Promise.resolve();
  assert.equal(draft.x, 3030.9016);
  assert.equal(requests.receive({ requestId: 'capture-8', ok: true, pointEditor: reply() }), true);
  await pending;
  assert.deepEqual(draft, point());
});

test('rejected SAVE preserves 8000-range draft and repeated CAPTURE never applies the previous 3000-range result', async () => {
  const requests = new PointEditorRequests();
  let draft = point();
  const save: PlcPointEditorCommand = { command: 'robot.point.save', index: 13, draft };
  const failed = requests.run('save', save, () => {}).then(result => { draft = result.point; });
  const rejected = assert.rejects(failed, /отклонена/);
  requests.receive({ requestId: 'save', ok: false, error: 'Запись отклонена PLC', pointEditor: { ...reply(), point: point(3030.9016) } });
  await rejected;
  assert.deepEqual(draft, point());
  for (const sequence of [10, 11, 12]) {
    const requestId = `capture-${sequence}`;
    const pending = requests.run(requestId, capture(), () => {}).then(result => { draft = result.point; });
    requests.receive({ requestId: 'save', ok: true, pointEditor: { ...reply(), point: point(3030.9016) } });
    requests.receive({ requestId, ok: true, pointEditor: reply(sequence) });
    await pending;
    assert.deepEqual(draft, point());
  }
});

test('missing reply, wrong point, wrong command and invalid coordinates fail without returning substitute values', async () => {
  for (const pointEditor of [undefined, reply(8, 14), { ...reply(), command: 'robot.point.save' },
    { ...reply(), point: { ...point(), x: null } }, { ...reply(), point: { ...point(), y: Number.NaN } }]) {
    const requests = new PointEditorRequests();
    const pending = requests.run('request', capture(), () => {});
    const rejected = assert.rejects(pending, /согласованный результат/);
    requests.receive({ requestId: 'request', ok: true, pointEditor });
    await rejected;
  }
});

test('another editor point cannot complete this pending request', async () => {
  const requests = new PointEditorRequests();
  const first = requests.run('GK-1', capture(13), () => {});
  const second = requests.run('GK-2', capture(14), () => {});
  requests.receive({ requestId: 'GK-2', ok: true, pointEditor: reply(9, 14) });
  assert.equal((await second).index, 14);
  requests.receive({ requestId: 'GK-1', ok: true, pointEditor: reply(8, 13) });
  assert.equal((await first).index, 13);
});

test('timeout and disconnect reject pending requests and ignore late replies', async () => {
  const requests = new PointEditorRequests(5);
  const pending = requests.run('timeout', capture(), () => {});
  await assert.rejects(pending, /Нет подтверждённого результата/);
  assert.equal(requests.receive({ requestId: 'timeout', ok: true, pointEditor: reply() }), false);
  const interrupted = requests.run('disconnected', capture(), () => {});
  const rejected = assert.rejects(interrupted, /Связь потеряна/);
  requests.reset('Связь потеряна');
  await rejected;
});
