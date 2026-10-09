import { monitoringTier } from './opcua-monitoring.mjs';

const rank = ['fast', 'status', 'normal', 'bulk'];
const rootOf = path => path.split(/[.[]/, 1)[0];

function selector(path, root, bounds) {
  const steps = [];
  let cursor = root;
  const suffix = path.slice(root.length);
  const tokens = suffix.match(/\.[^.\[]+|\[[^\]]+\]/g) ?? [];
  if (tokens.join('') !== suffix) throw new Error(`Invalid symbol path: ${path}`);
  for (const token of tokens) {
    if (token[0] === '.') { steps.push({ field: token.slice(1) }); cursor += token; continue; }
    const indices = token.slice(1, -1).split(',').map(Number);
    const shape = bounds.get(cursor);
    if (!shape?.lower || !shape.upper || shape.lower.length !== indices.length || shape.upper.length !== indices.length) {
      throw new Error(`Missing array bounds: ${cursor}`);
    }
    let offset = 0;
    indices.forEach((index, dimension) => {
      const min = shape.lower[dimension], max = shape.upper[dimension];
      if (![index, min, max].every(Number.isInteger) || index < min || index > max) throw new Error(`Invalid array index: ${path}`);
      offset = offset * (max - min + 1) + index - min;
    });
    steps.push({ index: offset }); cursor += token;
  }
  return value => {
    for (const step of steps) {
      if (step.field !== undefined) {
        // node-opcua converts CODESYS X/Name/Call into x/name/call.
        const field = value?.schema?.fields?.find(item => item.originalName === step.field)?.name ?? step.field;
        if (value === null || typeof value !== 'object' || !Object.hasOwn(value, field)) throw new Error(`Missing aggregate field: ${path}`);
        value = value[field];
      } else {
        if (!(Array.isArray(value) || ArrayBuffer.isView(value)) || step.index >= value.length) throw new Error(`Missing aggregate element: ${path}`);
        value = value[step.index];
      }
    }
    if (value === undefined) throw new Error(`Missing aggregate value: ${path}`);
    return value;
  };
}

export function aggregateCandidates(layout, entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const root = rootOf(entry[0]);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(entry);
  }
  return [...grouped.entries()].flatMap(([root, members]) => {
    const tier = members.reduce((best, [path]) => rank.indexOf(monitoringTier(path)) < rank.indexOf(best)
      ? monitoringTier(path) : best, 'bulk');
    if (!layout.compounds.has(root)) return members.map(([path, nodeId]) => ({ path, nodeId, tier: monitoringTier(path), members: [path], expand: value => [[path, value]] }));
    try {
      const selectors = members.map(([path]) => ({ path, get: selector(path, root, layout.bounds) }));
      return [{ path: root, nodeId: layout.compounds.get(root), tier, members: members.map(([path]) => path),
        expand: value => selectors.map(item => [item.path, item.get(value)]), fallback: members }];
    } catch {
      return members.map(([path, nodeId]) => ({ path, nodeId, tier: monitoringTier(path), members: [path], expand: value => [[path, value]] }));
    }
  });
}

// Verify parent access and decoding on this server before replacing leaf items.
// An unsupported parent falls back to its original leaf NodeIds.
export async function prepareAggregateMonitoring(layout, entries, read, { batchSize = 50 } = {}) {
  const candidates = aggregateCandidates(layout, entries), channels = [], initial = {}, timestamps = {}, fallbackRoots = [];
  const timestamp = value => value.sourceTimestamp?.getTime() ?? value.serverTimestamp?.getTime() ?? null;
  const acceptLeaf = async members => {
    for (let offset = 0; offset < members.length; offset += batchSize) {
      const batch = members.slice(offset, offset + batchSize), values = await read(batch.map(([, nodeId]) => nodeId));
      batch.forEach(([path, nodeId], index) => {
        const value = values[index];
        if (!value?.statusCode.isGood()) throw new Error(`OPC UA initial read ${path}: ${value?.statusCode}`);
        initial[path] = value.value.value;
        timestamps[path] = timestamp(value);
        channels.push({ path, nodeId, tier: monitoringTier(path), members: [path], expand: v => [[path, v]] });
      });
    }
  };
  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize), values = await read(batch.map(channel => channel.nodeId));
    for (let index = 0; index < batch.length; index++) {
      const channel = batch[index], value = values[index];
      let expanded;
      try {
        if (!value?.statusCode.isGood()) throw new Error(`OPC UA ${value?.statusCode}`);
        expanded = channel.expand(value.value.value);
      } catch (error) {
        if (!channel.fallback) throw error;
        fallbackRoots.push(channel.path); await acceptLeaf(channel.fallback); continue;
      }
      for (const [path, item] of expanded) { initial[path] = item; timestamps[path] = timestamp(value); }
      channels.push(channel);
    }
  }
  return { channels, initial, timestamps, fallbackRoots };
}
