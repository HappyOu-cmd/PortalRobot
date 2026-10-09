import assert from 'node:assert/strict';
import test from 'node:test';
import { browseSymbolChildren, collectSymbolLayout } from './opcua-symbols.mjs';
const statusCode = { isGood: () => true };
const ref = (name, nodeId = name) => ({ browseName: { name }, nodeId, nodeClass: 2 });

test('paged browse keeps all references and resumes every continuation point', async () => {
  const session = {
    browse: async nodes => nodes.map((_, i) => ({ statusCode, references: [ref(`first${i}`)], continuationPoint: Buffer.from([i + 1]) })),
    browseNext: async (points, release) => {
      assert.equal(release, false);
      return points.map(p => ({ statusCode, references: [ref(`last${p[0] - 1}`)] }));
    },
  };
  assert.deepEqual((await browseSymbolChildren(session, ['a', 'b'])).map(a => a.map(v => v.browseName.name)),
    [['first0', 'last0'], ['first1', 'last1']]);
});

test('symbol layout preserves selected IEC indices and reads declared array bounds in bounded batches', async () => {
  const tree = { root: [ref('aSlots', 'slots')], slots: [ref('aSlots[2]', 'slot2'), ref('aSlots[4]', 'slot4'),
    ref('IndexMin', 'min'), ref('IndexMax', 'max'), ref('Dimensions', 'dims')], slot2: [], slot4: [] };
  const session = {
    browse: async nodes => { assert.ok(nodes.length <= 2); return nodes.map(n => ({ statusCode, references: tree[n.nodeId] })); },
    read: async nodes => { assert.ok(nodes.length <= 2); return nodes.map(n => ({ statusCode, value: { value: new Int32Array([n.nodeId === 'min' ? 0 : 4]) } })); },
  };
  const layout = await collectSymbolLayout(session, 'root', { batchSize: 2 });
  assert.deepEqual([...layout.leaves], [['aSlots[2]', 'slot2'], ['aSlots[4]', 'slot4']]);
  assert.equal(layout.compounds.get('aSlots'), 'slots');
  assert.deepEqual(layout.bounds.get('aSlots'), { lower: [0], upper: [4] });
});

test('browse service failures are propagated instead of silently truncating the address space', async () => {
  await assert.rejects(browseSymbolChildren({ browse: async () => [{ statusCode: { isGood: () => false, toString: () => 'BadNodeIdUnknown' } }] }, ['bad']), /BadNodeIdUnknown/);
});
