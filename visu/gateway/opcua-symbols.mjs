// Browse in bounded batches, including continuation points. Keep leaf NodeIds
// for command writes and parent NodeIds/bounds for aggregate subscriptions.
export async function browseSymbolChildren(session, nodes) {
  if (!nodes.length) return [];
  const raw = await session.browse(nodes.map(nodeId => ({ nodeId,
    browseDirection: 0, referenceTypeId: 'HierarchicalReferences',
    includeSubtypes: true, nodeClassMask: 3, resultMask: 63,
  })));
  const results = Array.isArray(raw) ? raw : [raw];
  const references = results.map(result => {
    if (!result.statusCode.isGood()) throw new Error(`OPC UA browse: ${result.statusCode}`);
    return [...(result.references ?? [])];
  });
  let pending = results.flatMap((result, index) => result.continuationPoint?.length
    ? [{ index, point: result.continuationPoint }] : []);
  while (pending.length) {
    const next = await session.browseNext(pending.map(item => item.point), false);
    const pages = Array.isArray(next) ? next : [next];
    const more = [];
    pages.forEach((page, index) => {
      if (!page.statusCode.isGood()) throw new Error(`OPC UA browseNext: ${page.statusCode}`);
      references[pending[index].index].push(...(page.references ?? []));
      if (page.continuationPoint?.length) more.push({ index: pending[index].index, point: page.continuationPoint });
    });
    pending = more;
  }
  return references;
}

export async function collectSymbolLayout(session, root, { batchSize = 50, maxDepth = 8 } = {}) {
  const leaves = new Map(), compounds = new Map(), arrays = new Map();
  const ignored = new Set(['Dimensions', 'IndexMin', 'IndexMax']);
  const pending = [{ nodeId: root, path: '', depth: 0 }];
  while (pending.length) {
    const batch = pending.splice(0, batchSize).filter(node => node.depth <= maxDepth);
    if (!batch.length) continue;
    const references = await browseSymbolChildren(session, batch.map(node => node.nodeId));
    references.forEach((all, index) => {
      const node = batch[index];
      const children = all.filter(child => child.nodeClass === 2 && !ignored.has(child.browseName.name));
      const lower = all.find(child => child.browseName.name === 'IndexMin');
      const upper = all.find(child => child.browseName.name === 'IndexMax');
      if (lower && upper) arrays.set(node.path, { lowerNode: lower.nodeId, upperNode: upper.nodeId });
      if (!children.length) { if (node.path) leaves.set(node.path, node.nodeId); return; }
      if (node.path && !/[.\[]/.test(node.path)) compounds.set(node.path, node.nodeId);
      for (const child of children) {
        const name = child.browseName.name;
        const parts = node.path.split('.'), parent = parts.at(-1) ?? '';
        const path = node.path && name.startsWith(`${parent}[`)
          ? [...parts.slice(0, -1), name].join('.') : node.path ? `${node.path}.${name}` : name;
        pending.push({ nodeId: child.nodeId, path, depth: node.depth + 1 });
      }
    });
  }
  const metadata = [...arrays.entries()].flatMap(([path, nodes]) =>
    [{ path, key: 'lower', nodeId: nodes.lowerNode }, { path, key: 'upper', nodeId: nodes.upperNode }]);
  const bounds = new Map();
  for (let offset = 0; offset < metadata.length; offset += batchSize) {
    const batch = metadata.slice(offset, offset + batchSize);
    const values = await session.read(batch.map(({ nodeId }) => ({ nodeId, attributeId: 13 })));
    batch.forEach(({ path, key }, index) => {
      const value = values[index];
      if (!value?.statusCode.isGood() || !(Array.isArray(value.value.value) || ArrayBuffer.isView(value.value.value))) return;
      const entry = bounds.get(path) ?? {};
      entry[key] = Array.from(value.value.value);
      bounds.set(path, entry);
    });
  }
  return { leaves, compounds, bounds };
}
