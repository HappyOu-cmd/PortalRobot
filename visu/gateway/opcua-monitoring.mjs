const fastPaths = new Set([
  'lrActualX', 'lrActualY', 'lrActualZ',
  'udiPlcHeartbeat', 'udiHmiHeartbeat', 'udiHmiCommandClockMs',
  'udiPointEditorCommandSeq', 'udiPointEditorAckSeq', 'uiPointEditorResult',
  'uiPointEditorRejectReason', 'udiCellModeCommandSeq', 'udiCellModeAckSeq',
  'uiCellModeResult', 'udiTwinCommandSeq', 'udiTwinAckSeq', 'uiTwinResult',
  'udiGeometryCommandSeq', 'udiGeometryAckSeq', 'uiGeometryResult',
]);

// Settings and scenario payloads need changes reported, but not 20 samples/s.
const bulkRoots = new Set([
  'stTestScenario', 'stTestRequest', 'stTwinRequest', 'stGeometryRequest',
  'astTwinConfig', 'astGeometryConfig', 'stCellSettings',
  'stCellAxisTimeouts', 'stCellAxisGroupTimeouts', 'stRobotTimeouts',
  'astMachineTimeouts', 'stMagazineTimeouts', 'stMultiTypeConfig',
  'astPointEditorPoints', 'auiPointEditorPointId', 'astPointEditorDraft',
]);

function interval(value, fallback, minimum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : Math.max(minimum, fallback);
}

export function monitoringIntervals(env = process.env) {
  const fast = interval(env.OPCUA_SAMPLING_MS, 100, 10);
  const status = interval(env.OPCUA_STATUS_SAMPLING_MS, 100, fast);
  const normal = interval(env.OPCUA_NORMAL_SAMPLING_MS, 250, status);
  const bulk = interval(env.OPCUA_BULK_SAMPLING_MS, 1000, normal);
  return { fast, status, normal, bulk };
}

export function monitoringTier(path) {
  if (fastPaths.has(path)
    || /(?:^|\.)lrActual(?:X|Y|Z|Position)$/.test(path)
    || /(?:CommandSeq|AckSeq|StopSeq|StopAck|SettingAck|SettingResult)(?:\[\d+\])?$/.test(path)) return 'fast';
  const root = path.split(/[.[]/, 1)[0];
  if (bulkRoots.has(root) || /(?:^|\.)Config\./.test(path)) return 'bulk';
  if (/^(?:st|ast)\w*(?:Status|Diag)$/.test(root)
    || /(?:Allowed|Ack|Result|RejectReason)(?:\[\d+\])?$/.test(path)
    || /^x(?:GlobalError|HmiConnectionAlive|CellManual|ManualRecoveryActive|PointCheckActive)$/.test(path)) return 'status';
  return 'normal';
}

export function monitoringBatches(entries, intervals, batchSize = 50, tierFor = monitoringTier) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Invalid OPC UA monitoring batch size');
  const tiers = { fast: [], status: [], normal: [], bulk: [] };
  for (const entry of entries) tiers[tierFor(entry[0])].push(entry);
  return Object.entries(tiers).flatMap(([tier, items]) => {
    const batches = [];
    for (let offset = 0; offset < items.length; offset += batchSize) {
      batches.push({ tier, samplingIntervalMs: intervals[tier], entries: items.slice(offset, offset + batchSize) });
    }
    return batches;
  });
}

function initialized(group, entries, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      group.off('initialized', ready);
      group.off('err', failed);
      group.off('terminated', terminated);
    };
    const failed = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const ready = () => {
      const failedItems = (group.monitoredItems ?? []).flatMap((item, index) =>
        item.statusCode && !item.statusCode.isGood() ? [`${entries[index][0]}: ${item.statusCode}`] : []);
      if (failedItems.length) {
        failed(new Error(`OPC UA rejected monitored items: ${failedItems.slice(0, 3).join(', ')}`));
        return;
      }
      cleanup();
      resolve();
    };
    const terminated = () => failed(new Error('OPC UA monitoring group terminated during initialization'));
    const timer = setTimeout(() => failed(new Error('OPC UA monitoring group initialization timed out')), timeoutMs);
    group.once('initialized', ready);
    group.once('err', failed);
    group.once('terminated', terminated);
  });
}

// The group API starts CreateMonitoredItems asynchronously. Await each result
// instead of submitting >100 requests to an embedded server at the same time.
export async function initializeMonitoring(batches, createGroup, onChanged, { timeoutMs = 30_000 } = {}) {
  const groups = [];
  for (const batch of batches) {
    const group = createGroup(batch);
    group.on('changed', (_item, value, index) => onChanged(batch.entries[index]?.[0], value));
    await initialized(group, batch.entries, timeoutMs);
    groups.push(group);
  }
  return groups;
}

export function monitoringSummary(batches, groups, publishingIntervalMs) {
  const tiers = {};
  let estimatedSamplesPerSecond = 0;
  let revisedSamplesPerSecond = 0;
  let revisedItems = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const summary = tiers[batch.tier] ??= {
      items: 0, requestedSamplingIntervalMs: batch.samplingIntervalMs,
      revisedMinSamplingIntervalMs: null, revisedMaxSamplingIntervalMs: null,
    };
    summary.items += batch.entries.length;
    estimatedSamplesPerSecond += batch.entries.length * 1000 / batch.samplingIntervalMs;
    for (const item of groups[index]?.monitoredItems ?? []) {
      const revised = item.monitoringParameters?.samplingInterval;
      if (!Number.isFinite(revised) || revised < 0) continue;
      if (revised > 0) { revisedSamplesPerSecond += 1000 / revised; revisedItems++; }
      summary.revisedMinSamplingIntervalMs = summary.revisedMinSamplingIntervalMs === null
        ? revised : Math.min(summary.revisedMinSamplingIntervalMs, revised);
      summary.revisedMaxSamplingIntervalMs = summary.revisedMaxSamplingIntervalMs === null
        ? revised : Math.max(summary.revisedMaxSamplingIntervalMs, revised);
    }
  }
  return { items: batches.reduce((count, batch) => count + batch.entries.length, 0),
    groups: groups.length, publishingIntervalMs, tiers,
    estimatedRequestedSamplesPerSecond: Math.round(estimatedSamplesPerSecond),
    estimatedRevisedSamplesPerSecond: revisedItems === batches.reduce((n, batch) => n + batch.entries.length, 0)
      ? Math.round(revisedSamplesPerSecond) : null };
}
