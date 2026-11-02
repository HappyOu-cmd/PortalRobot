import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareTableMonitoring, withTableAliases } from './opcua-tables.mjs';

const revisionFields = ['uiVersion', 'udiEpoch', 'udiMagazineInventory', 'udiTwinStore', 'udiAlarmEvents'];
const good = value => ({ statusCode: { isGood: () => true }, value: { value: structuredClone(value) } });
const bad = { statusCode: { isGood: () => false, toString: () => 'BadNotReadable' } };

function fixture({ protocol = true, fallbackInventory = false } = {}) {
  const revision = { uiVersion: 1, udiEpoch: 100, udiMagazineInventory: 2, udiTwinStore: 2, udiAlarmEvents: 2 };
  const inventory = [{ aSlots: [{ xInPosition: true, uiProductType: 1 }, { xInPosition: false, uiProductType: 0 }] }];
  const events = [{ udiSequence: 1, xActive: true }, { udiSequence: 0, xActive: false }];
  const paths = [
    ...(protocol ? revisionFields.map(field => `stHmiDataRevision.${field}`) : []),
    ...inventory[0].aSlots.flatMap((_, i) => ['xInPosition', 'uiProductType'].map(field => `astMagazineInventory[1].aSlots[${i + 1}].${field}`)),
    ...inventory[0].aSlots.flatMap((_, i) => ['xInPosition', 'uiProductType'].map(field => `astMagazineSlot[${i + 1}].${field}`)),
    ...events.flatMap((_, i) => ['udiSequence', 'xActive'].map(field => `astAlarmEvent[${i + 1}].${field}`)),
  ];
  const values = new Map([['stHmiDataRevision', revision], ['astMagazineInventory', inventory],
    ['astMagazineSlot', inventory[0].aSlots], ['astAlarmEvent', events]]);
  const layout = {
    compounds: new Map([...values.keys()].map(path => [path, path])),
    bounds: new Map([
      ['astMagazineInventory', { lower: [1], upper: [1] }],
      ['astMagazineInventory[1].aSlots', { lower: [1], upper: [2] }],
      ['astMagazineSlot', { lower: [1], upper: [2] }],
      ['astAlarmEvent', { lower: [1], upper: [2] }],
    ]),
  };
  if (!protocol) layout.compounds.delete('stHmiDataRevision');
  const calls = [];
  let hook = () => {};
  const read = async nodes => {
    calls.push(nodes);
    const result = nodes.map(node => {
      if (fallbackInventory && node === 'astMagazineInventory') return bad;
      if (values.has(node)) return good(values.get(node));
      const match = /^astMagazineInventory\[1\]\.aSlots\[(\d+)\]\.(\w+)$/.exec(node);
      if (match) return good(inventory[0].aSlots[Number(match[1]) - 1][match[2]]);
      throw new Error(`Unexpected read ${node}`);
    });
    hook(nodes);
    return result;
  };
  return { revision, inventory, events, paths, layout, calls, read, hook: fn => { hook = fn; },
    prepare: () => prepareTableMonitoring(layout, paths.map(path => [path, path]), read) };
}

test('initial snapshot keeps every field; idle revision notifications never reread tables', async () => {
  const f = fixture(), plan = await f.prepare();
  assert.deepEqual(Object.keys(plan.initial).sort(), f.paths.sort());
  assert.deepEqual(plan.tableMonitoring.roots, ['astMagazineInventory', 'astAlarmEvent']);
  assert.equal(plan.tableMonitoring.deferredFields, 8);
  assert.equal(plan.tableMonitoring.aliasFields, 4);
  assert.deepEqual(plan.channels.map(channel => channel.path), ['stHmiDataRevision']);
  assert.equal(plan.channels[0].tier, 'status');
  f.calls.length = 0;
  const before = plan.reader.stats.tableReads;
  for (let i = 0; i < 20; i++) assert.deepEqual(await plan.reader.refresh(), { expanded: [], unsettled: false });
  assert.equal(plan.reader.stats.tableReads, before);
  assert.ok(f.calls.every(nodes => nodes.length === 1 && nodes[0] === 'stHmiDataRevision'));
});

test('one changed inventory reads only that parent and updates compatible legacy fields', async () => {
  const f = fixture(), plan = await f.prepare();
  f.calls.length = 0;
  f.inventory[0].aSlots[1] = { xInPosition: true, uiProductType: 3 };
  f.revision.udiMagazineInventory += 2;
  const result = await plan.reader.refresh();
  assert.equal(result.unsettled, false);
  assert.deepEqual(f.calls, [['stHmiDataRevision'], ['astMagazineInventory'], ['stHmiDataRevision']]);
  const delta = Object.fromEntries(withTableAliases(result.expanded, plan.aliases));
  assert.equal(delta['astMagazineInventory[1].aSlots[2].uiProductType'], 3);
  assert.equal(delta['astMagazineSlot[2].uiProductType'], 3);
  assert.equal(delta['astMagazineSlot[2].xInPosition'], true);
});

test('an inventory changed during Read is discarded without starving a stable alarm table', async () => {
  const f = fixture(), plan = await f.prepare();
  f.revision.udiMagazineInventory += 2;
  f.revision.udiAlarmEvents += 2;
  f.events[0].xActive = false;
  f.hook(nodes => {
    if (nodes.includes('astMagazineInventory')) {
      f.revision.udiMagazineInventory += 2;
      f.inventory[0].aSlots[0].uiProductType = 2;
    }
  });
  const raced = await plan.reader.refresh();
  assert.equal(raced.unsettled, true);
  assert.ok(raced.expanded.every(([path]) => path.startsWith('astAlarmEvent')));
  assert.equal(Object.fromEntries(raced.expanded)['astAlarmEvent[1].xActive'], false);
  f.hook(() => {});
  const retried = await plan.reader.refresh();
  assert.equal(retried.unsettled, false);
  assert.equal(Object.fromEntries(retried.expanded)['astMagazineInventory[1].aSlots[1].uiProductType'], 2);
  assert.ok(retried.expanded.every(([path]) => path.startsWith('astMagazineInventory')));
  assert.equal(plan.reader.stats.discardedTables, 1);
});

test('odd revisions delay reading; wrapping uint32 and restarting with the same revision refresh data', async () => {
  const f = fixture(), plan = await f.prepare();
  f.calls.length = 0;
  f.revision.udiMagazineInventory = 3;
  assert.deepEqual(await plan.reader.refresh(), { expanded: [], unsettled: true });
  assert.deepEqual(f.calls, [['stHmiDataRevision']]);
  for (const revision of [0xffff_fffe, 0, 2]) {
    f.revision.udiMagazineInventory = revision;
    assert.ok((await plan.reader.refresh()).expanded.length > 0);
  }
  f.revision.udiEpoch++;
  f.inventory[0].aSlots[0].uiProductType = 3;
  const reboot = await plan.reader.refresh();
  assert.equal(reboot.expanded.length, 8);
  assert.equal(Object.fromEntries(reboot.expanded)['astMagazineInventory[1].aSlots[1].uiProductType'], 3);
});

test('a restart during Read publishes no payload from the previous application epoch', async () => {
  const f = fixture(), plan = await f.prepare();
  f.revision.udiAlarmEvents += 2;
  f.hook(nodes => { if (nodes.includes('astAlarmEvent')) f.revision.udiEpoch++; });
  assert.deepEqual(await plan.reader.refresh(), { expanded: [], unsettled: true });
  f.hook(() => {});
  assert.equal((await plan.reader.refresh()).expanded.length, 8);
});

test('old PLC keeps aggregate subscriptions and identical legacy fields', async () => {
  const f = fixture({ protocol: false }), plan = await f.prepare();
  assert.equal(plan.reader, null);
  assert.equal(plan.tableMonitoring.protocol, null);
  assert.deepEqual(plan.channels.map(channel => channel.path), ['astMagazineInventory', 'astAlarmEvent']);
  assert.deepEqual(Object.keys(plan.initial).sort(), f.paths.sort());
  assert.equal(plan.initial['astMagazineSlot[1].uiProductType'], 1);
});

test('an unsupported table parent stays on leaf monitoring while other tables use revisions', async () => {
  const f = fixture({ fallbackInventory: true }), plan = await f.prepare();
  assert.deepEqual(plan.fallbackRoots, ['astMagazineInventory']);
  assert.deepEqual(plan.tableMonitoring.roots, ['astAlarmEvent']);
  assert.ok(plan.channels.some(channel => channel.path === 'astMagazineInventory[1].aSlots[1].xInPosition'));
  assert.deepEqual(Object.keys(plan.initial).sort(), f.paths.sort());
});

test('missing legacy sources retain the original legacy parent instead of inventing fields', async () => {
  const f = fixture();
  const paths = f.paths.filter(path => !path.startsWith('astMagazineInventory'));
  const plan = await prepareTableMonitoring(f.layout, paths.map(path => [path, path]), f.read);
  assert.equal(plan.aliases.size, 0);
  assert.ok(plan.channels.some(channel => channel.path === 'astMagazineSlot'));
});

test('invalid revisions, bad reads and incomplete decodes fail explicitly', async () => {
  const f = fixture(), plan = await f.prepare();
  f.revision.udiAlarmEvents = -1;
  await assert.rejects(plan.reader.refresh(), /Invalid OPC UA table revision/);
  f.revision.udiAlarmEvents = 4;
  delete f.events[0].xActive;
  await assert.rejects(plan.reader.refresh(), /Missing aggregate field/);
  f.revision.uiVersion = 2;
  await assert.rejects(plan.reader.refresh(), /Unsupported OPC UA table revision protocol/);
  plan.reader.read = async () => [bad];
  await assert.rejects(plan.reader.refresh(), /BadNotReadable/);
});

test('initialization cannot report connected with an unfinished table copy', async () => {
  const f = fixture();
  f.revision.udiAlarmEvents = 3;
  await assert.rejects(f.prepare(), /tables changed during initialization/);
});
