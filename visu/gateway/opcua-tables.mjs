import { prepareAggregateMonitoring } from './opcua-aggregate.mjs';

export const tableRevisionRoot = 'stHmiDataRevision';
const tableDefinitions = [
  ['astMagazineInventory', 'udiMagazineInventory'],
  ['astTwinStore', 'udiTwinStore'],
  ['astAlarmEvent', 'udiAlarmEvents'],
];
const revisionPath = field => `${tableRevisionRoot}.${field}`;
const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
const stable = value => uint32(value) && value % 2 === 0;

function legacyAliases(entries) {
  const paths = new Set(entries.map(([path]) => path));
  const legacy = entries.filter(([path]) => path.startsWith('astMagazineSlot['));
  const pairs = legacy.map(([path]) => [path, path.replace(/^astMagazineSlot/, 'astMagazineInventory[1].aSlots')]);
  // Only replace the legacy array if every selected field has an exact source.
  return pairs.every(([, source]) => paths.has(source)) ? new Map(pairs) : new Map();
}

export function withTableAliases(expanded, aliases) {
  const values = new Map(expanded);
  for (const [alias, source] of aliases) if (values.has(source)) values.set(alias, values.get(source));
  return [...values];
}

// Revisions cover the published HMI copies, not the live owners' mutable data.
// Validate each table separately: a busy magazine must not starve alarm reads.
export class RevisionTableReader {
  constructor(header, tables, read) {
    this.header = header;
    this.tables = tables;
    this.read = read;
    this.accepted = new Map();
    this.stats = { readRequests: 0, tableReads: 0, discardedTables: 0 };
  }

  async values(channels) {
    this.stats.readRequests++;
    const values = await this.read(channels.map(channel => channel.nodeId));
    return channels.map((channel, index) => {
      const value = values[index];
      if (!value?.statusCode?.isGood()) throw new Error(`OPC UA table read ${channel.path}: ${value?.statusCode}`);
      return value.value.value;
    });
  }

  async readHeader() {
    const [value] = await this.values([this.header]);
    const fields = Object.fromEntries(this.header.expand(value));
    const version = fields[revisionPath('uiVersion')];
    if (version !== 0 && version !== 1) throw new Error(`Unsupported OPC UA table revision protocol: ${version}`);
    const epoch = fields[revisionPath('udiEpoch')];
    if (!uint32(epoch)) throw new Error('Invalid OPC UA table epoch');
    return { fields, epoch, ready: version === 1 && epoch !== 0 };
  }

  async refresh() {
    const before = await this.readHeader();
    if (!before.ready) return { expanded: [], unsettled: true };
    let unsettled = false;
    const changed = this.tables.filter(table => {
      const revision = before.fields[revisionPath(table.revision)];
      if (!uint32(revision)) throw new Error(`Invalid OPC UA table revision: ${table.path}`);
      if (!stable(revision)) { unsettled = true; return false; }
      return this.accepted.get(table.path) !== `${before.epoch}:${revision}`;
    });
    if (!changed.length) return { expanded: [], unsettled };
    const values = await this.values(changed);
    this.stats.tableReads += changed.length;
    const after = await this.readHeader();
    const expanded = [];
    changed.forEach((table, index) => {
      const revision = before.fields[revisionPath(table.revision)];
      if (!after.ready || before.epoch !== after.epoch || revision !== after.fields[revisionPath(table.revision)]) {
        this.stats.discardedTables++;
        unsettled = true;
        return;
      }
      expanded.push(...table.expand(values[index]));
      this.accepted.set(table.path, `${before.epoch}:${revision}`);
    });
    return { expanded, unsettled };
  }
}

export async function prepareTableMonitoring(layout, entries, read) {
  const aliases = legacyAliases(entries);
  const prepared = await prepareAggregateMonitoring(layout, entries.filter(([path]) => !aliases.has(path)), read);
  const header = prepared.channels.find(channel => channel.path === tableRevisionRoot);
  const tables = header && prepared.initial[revisionPath('uiVersion')] === 1
    ? tableDefinitions.flatMap(([path, revision]) => {
      const channel = prepared.channels.find(item => item.path === path);
      return channel ? [{ ...channel, revision }] : [];
    }) : [];
  const reader = tables.length ? new RevisionTableReader(header, tables, read) : null;
  if (reader) {
    header.tier = 'status';
    let settled = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await reader.refresh();
      Object.assign(prepared.initial, Object.fromEntries(result.expanded));
      if (!result.unsettled) { settled = true; break; }
    }
    if (!settled) throw new Error('OPC UA tables changed during initialization; reconnecting');
  }
  const deferred = new Set(tables.map(table => table.path));
  return {
    ...prepared,
    channels: prepared.channels.filter(channel => !deferred.has(channel.path)),
    initial: Object.fromEntries(withTableAliases(Object.entries(prepared.initial), aliases)),
    aliases, reader,
    tableMonitoring: {
      protocol: reader ? 1 : null,
      roots: [...deferred],
      deferredFields: tables.reduce((sum, table) => sum + table.members.length, 0),
      aliasFields: aliases.size,
      stats: reader?.stats ?? null,
    },
  };
}
