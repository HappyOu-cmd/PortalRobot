import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AttributeIds,
  BrowseDirection,
  ClientMonitoredItemGroup,
  ClientSubscription,
  DataType,
  MessageSecurityMode,
  NodeClass,
  NodeClassMask,
  OPCUAClient,
  SecurityPolicy,
  TimestampsToReturn,
  Variant,
} from 'node-opcua';
import { WebSocketServer } from 'ws';
import {
  CyclogramStore,
  classifyCyclogram,
  isTransientRobotActivity,
  stabilizeCyclogramStates,
  createCyclogramWorkbook,
  cyclogramExportFilename,
  cyclogramRequiredSymbols,
} from './cyclogram.mjs';

const endpointUrl = process.env.OPCUA_ENDPOINT ?? 'opc.tcp://127.0.0.1:4840';
const gatewayPort = Number(process.env.GATEWAY_PORT ?? 3001);
const gatewayHost = process.env.GATEWAY_HOST ?? '127.0.0.1';
const reconnectDelayMs = Number(process.env.OPCUA_RECONNECT_MS ?? 3000);
const publishingIntervalMs = Math.max(10, Number(process.env.OPCUA_PUBLISHING_MS ?? 50));
const samplingIntervalMs = Math.max(10, Number(process.env.OPCUA_SAMPLING_MS ?? 50));
const uiRefreshIntervalMs = Math.max(20, Number(process.env.OPCUA_UI_REFRESH_MS ?? 50));
const cyclogramSettleMs = Math.max(40, Number(process.env.CYCLOGRAM_SETTLE_MS ?? 80));
const plcRootName = process.env.OPCUA_GVL ?? 'GVL_HMI';
const cyclogramRetentionHours = Number(process.env.CYCLOGRAM_RETENTION_HOURS ?? 24);
const cyclogramDbPath = process.env.CYCLOGRAM_DB_PATH ?? 'gateway/data/cyclogram.sqlite';
const cyclogramTimeZone = process.env.CYCLOGRAM_TIMEZONE ?? 'Asia/Yekaterinburg';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = normalize(join(__dirname, '..', 'dist'));

const requiredSymbols = [...new Set([
  'udiPlcHeartbeat',
  'stCellStatus.xRunning',
  'stCellStatus.xReadyToStart',
  'stCellStatus.xDrivesReady',
  'stCellStatus.xRobotReady',
  'stCellStatus.xMagazineReady',
  'stCellStatus.uiReadyMachines',
  'stCellStatus.uiSelectedMachine',
  'stCellDiag.eState',
  'rLoadCNC_1',
  'rLoadCNC_2',
  'rLoadCNC_3',
  'rRobot',
  'xCellManual',
  'stRobotDiag.eState',
  'stRobotDiag.eActiveAction',
  'stRobotDiag.eActivePoint',
  'stRobotStatus.xGripper1Closed',
  'xRobotDrivesEnable',
  'xRobotDrivesDisable',
  'xRobotStop',
  'xRobotReset',
  'astMachineStatus[1].xEnabled',
  'astMachineStatus[1].xProcessing',
  'astMachineStatus[1].ePartType',
  'astMachineStatus[1].tCycleElapsed',
  'astMachineStatus[1].tCycleExpected',
  'astMachineStatus[1].tRemaining',
  'astMachineDiag[1].eState',
  'astMachineIoStatus[1].xDoorOpen',
  'axMachineSetBlank[1]',
  'axMachineSetDetail[1]',
  'axMachineAcceptDoor[1]',
  'axMachineRejectDoor[1]',
  'axMachineAcceptRun[1]',
  'axMachineRejectRun[1]',
  'stMagazineStatus.xEnabled',
  'stMagazineStatus.xDisablePending',
  'stMagazineStatus.eActualOperation',
  'stMagazineStatus.iSelectedBlank',
  'stMagazineStatus.iSelectedFreeSlot',
  'stMagazineDiag.eState',
  'astMagazineSlot[1].eDetailType',
  'xMagazineCycleSlot',
  'uiMagazineEditSlot',
  'MagazineSafeZ_2',
  'astMachineStatus[1].xDisablePending',
  'stAlarmStatus.uiActiveAlarmCount',
  'stAlarmStatus.uiActiveWarningCount',
  'astAlarmEvent[1].udiSequence',
  ...cyclogramRequiredSymbols,
])];
const cyclogramSymbolSet = new Set(cyclogramRequiredSymbols);

const commandMap = {
  'cell.enable': { path: 'xCellEnable', dataType: DataType.Boolean, pulse: true },
  'cell.disable': { path: 'xCellDisable', dataType: DataType.Boolean, pulse: true },
  'cell.start': { path: 'xCellStart', dataType: DataType.Boolean, pulse: true },
  'cell.stop': { path: 'xCellStop', dataType: DataType.Boolean, pulse: true },
  'cell.reset': { path: 'xCellReset', dataType: DataType.Boolean, pulse: true },
  'alarms.resetWarnings': { path: 'xAlarmResetWarnings', dataType: DataType.Boolean, pulse: true },
  'cell.manual': { path: 'xCellManual', dataType: DataType.Boolean },
  'robot.enableDrives': { path: 'xRobotDrivesEnable', dataType: DataType.Boolean, pulse: true },
  'robot.disableDrives': { path: 'xRobotDrivesDisable', dataType: DataType.Boolean, pulse: true },
  'robot.stop': { path: 'xRobotStop', dataType: DataType.Boolean, pulse: true },
  'robot.reset': { path: 'xRobotReset', dataType: DataType.Boolean, pulse: true },
  'magazine.enable': { path: 'xMagazineEnable', dataType: DataType.Boolean, pulse: true },
  'magazine.disable': { path: 'xMagazineDisable', dataType: DataType.Boolean, pulse: true },
  'magazine.fillBlanks': { path: 'xMagazineFillBlanks', dataType: DataType.Boolean, pulse: true },
  'magazine.clear': { path: 'xMagazineClear', dataType: DataType.Boolean, pulse: true },
  'magazine.rows': { path: 'MagazineRows', dataType: DataType.UInt16, transform: (v) => Math.max(1, Math.min(70, Math.round(Number(v)))) },
  'magazine.columns': { path: 'MagazineColumns', dataType: DataType.UInt16, transform: (v) => Math.max(1, Math.min(70, Math.round(Number(v)))) },
  'magazine.pitchX': { path: 'MagazinePitchX', dataType: DataType.Double, transform: (v) => Number(v) },
  'magazine.pitchY': { path: 'MagazinePitchY', dataType: DataType.Double, transform: (v) => Number(v) },
  'magazine.safeAbove': { path: 'MagazineSafeZ_1', dataType: DataType.Double, transform: (v) => Number(v) },
  'magazine.safeInside': { path: 'MagazineSafeZ_2', dataType: DataType.Double, transform: (v) => Number(v) },
};

let opcua = null;
let symbolNodes = new Map();
let latestValues = {};
let cyclogramConnected = false;
let stableCyclogramStates = null;
let transientRobotSince = null;
let cyclogramStore = null;
let cyclogramError = '';
try {
  cyclogramStore = new CyclogramStore({
    databasePath: cyclogramDbPath,
    retentionHours: cyclogramRetentionHours,
  });
} catch (error) {
  cyclogramError = error instanceof Error ? error.message : String(error);
  console.error(`[Cyclogram] Storage unavailable: ${cyclogramError}`);
}

function cyclogramHealth(now = Date.now()) {
  if (!cyclogramStore) return { available: false, error: cyclogramError || 'Хранилище циклограммы недоступно' };
  try {
    return cyclogramStore.status(now);
  } catch (error) {
    cyclogramError = error instanceof Error ? error.message : String(error);
    return { available: false, error: cyclogramError };
  }
}

let connectionState = {
  status: 'connecting', endpoint: endpointUrl, message: 'Подключение к OPC UA', symbols: 0, missing: requiredSymbols,
  cyclogram: cyclogramHealth(),
};

const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
};

function jsonValue(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object') {
    if (typeof value.valueOf === 'function') {
      const primitive = value.valueOf();
      if (primitive !== value && typeof primitive !== 'object') return jsonValue(primitive);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const socket of webSocketServer.clients) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function publishConnection() {
  broadcast({ type: 'connection', ...connectionState });
}

function publishSnapshot(values = latestValues, full = true) {
  broadcast({ type: 'snapshot', timestamp: Date.now(), full, values });
}

function hasCyclogramData() {
  return cyclogramRequiredSymbols.every((path) => Object.hasOwn(latestValues, path));
}

function recordCyclogram(timestamp = Date.now()) {
  if (!cyclogramStore || !cyclogramConnected || !hasCyclogramData()) return;
  try {
    const classified = classifyCyclogram(latestValues);
    if (isTransientRobotActivity(classified.robot)) transientRobotSince ??= timestamp;
    else transientRobotSince = null;
    stableCyclogramStates = stabilizeCyclogramStates(
      stableCyclogramStates,
      classified,
      { transientForMs: transientRobotSince === null ? 0 : timestamp - transientRobotSince },
    );
    const update = cyclogramStore.record(stableCyclogramStates, timestamp);
    if (update.changed) broadcast({ type: 'cyclogram-update', serverTime: timestamp, ...update });
  } catch (error) {
    cyclogramError = error instanceof Error ? error.message : String(error);
    console.error(`[Cyclogram] ${cyclogramError}`);
  }
}

function stopCyclogram(timestamp = Date.now()) {
  if (!cyclogramStore) return;
  try {
    const update = cyclogramStore.stop(timestamp);
    stableCyclogramStates = null;
    transientRobotSince = null;
    if (update.changed) broadcast({ type: 'cyclogram-update', serverTime: timestamp, ...update });
  } catch (error) {
    cyclogramError = error instanceof Error ? error.message : String(error);
    console.error(`[Cyclogram] ${cyclogramError}`);
  }
}

function publishCyclogramHistory(socket = null, timestamp = Date.now()) {
  if (!cyclogramStore) return;
  const message = {
    type: 'cyclogram-history',
    serverTime: timestamp,
    retentionMs: cyclogramStore.retentionMs,
    intervals: cyclogramStore.intervals({ nowMs: timestamp }),
  };
  if (socket) send(socket, message);
  else broadcast(message);
}

function clearCyclogram(timestamp = Date.now()) {
  if (!cyclogramStore) throw new Error(cyclogramError || 'Хранилище циклограммы недоступно');
  cyclogramStore.clear();
  stableCyclogramStates = null;
  transientRobotSince = null;
  if (cyclogramConnected && hasCyclogramData()) {
    stableCyclogramStates = classifyCyclogram(latestValues);
    cyclogramStore.record(stableCyclogramStates, timestamp, { forceCheckpoint: true });
  }
  publishCyclogramHistory(null, timestamp);
}

async function browseChildren(session, nodeId) {
  const result = await session.browse({
    nodeId, browseDirection: BrowseDirection.Forward, referenceTypeId: 'HierarchicalReferences',
    includeSubtypes: true, nodeClassMask: NodeClassMask.Object | NodeClassMask.Variable, resultMask: 63,
  });
  return result.references ?? [];
}

async function findGvlNode(session) {
  const queue = [{ nodeId: 'ObjectsFolder', depth: 0 }];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    const key = current.nodeId.toString();
    if (visited.has(key) || current.depth > 8) continue;
    visited.add(key);
    for (const child of await browseChildren(session, current.nodeId)) {
      if (child.browseName.name === plcRootName) return child.nodeId;
      if (child.nodeClass === NodeClass.Object) queue.push({ nodeId: child.nodeId, depth: current.depth + 1 });
    }
  }
  throw new Error(`В OPC UA не найден ${plcRootName}`);
}

async function collectLeafVariables(session, rootNodeId) {
  const leaves = new Map();
  const ignored = new Set(['Dimensions', 'IndexMin', 'IndexMax']);
  async function visit(nodeId, path, depth) {
    if (depth > 8) return;
    const children = (await browseChildren(session, nodeId)).filter(
      (child) => child.nodeClass === NodeClass.Variable && !ignored.has(child.browseName.name),
    );
    if (children.length === 0) {
      if (path) leaves.set(path, nodeId);
      return;
    }
    for (const child of children) {
      const childName = child.browseName.name;
      const pathParts = path.split('.');
      const parentName = pathParts.at(-1) ?? '';
      const childPath = path && childName.startsWith(`${parentName}[`)
        ? [...pathParts.slice(0, -1), childName].join('.')
        : path ? `${path}.${childName}` : childName;
      await visit(child.nodeId, childPath, depth + 1);
    }
  }
  await visit(rootNodeId, '', 0);
  return leaves;
}

async function readInitialValues(session, entries) {
  for (let offset = 0; offset < entries.length; offset += 50) {
    const chunk = entries.slice(offset, offset + 50);
    const requests = chunk.map(([, nodeId]) => ({ nodeId, attributeId: AttributeIds.Value }));
    const values = await session.read(requests);
    chunk.forEach(([path], index) => {
      if (values[index]?.statusCode?.isGood()) latestValues[path] = jsonValue(values[index].value.value);
    });
  }
}

async function writeValue(path, dataType, value) {
  if (!opcua?.session) throw new Error('OPC UA не подключён');
  const nodeId = symbolNodes.get(path);
  if (!nodeId) throw new Error(`Переменная ${plcRootName}.${path} не опубликована`);
  const status = await opcua.session.writeSingleNode(nodeId, new Variant({ dataType, value }));
  if (!status.isGood()) throw new Error(`PLC отклонил запись ${path}: ${status.toString()}`);
  // Do not wait for the next subscription publish before reflecting a successful
  // write in the HMI. The following OPC UA notification remains authoritative.
  latestValues[path] = jsonValue(value);
  publishSnapshot({ [path]: latestValues[path] }, false);
}

async function executeCommand(message) {
  const requestId = String(message.requestId ?? Date.now());
  if (message.command === 'magazine.setSlot') {
    const slot = Math.round(Number(message.value));
    if (!Number.isInteger(slot) || slot < 1 || slot > 70) throw new Error('Неверный номер слота магазина');
    await writeValue('uiMagazineEditSlot', DataType.UInt16, slot);
    await writeValue('xMagazineCycleSlot', DataType.Boolean, true);
    setTimeout(() => writeValue('xMagazineCycleSlot', DataType.Boolean, false).catch(console.error), 150);
    return requestId;
  }
  let definition = commandMap[message.command];
  if (message.command?.startsWith('machine.')) {
    const index = Number(message.machine);
    if (!Number.isInteger(index) || index < 1 || index > 3) throw new Error('Неверный номер станка');
    const action = message.command.slice('machine.'.length);
    const machineCommands = {
      enable: { path: `axMachineEnable[${index}]`, dataType: DataType.Boolean, pulse: true },
      disable: { path: `axMachineDisable[${index}]`, dataType: DataType.Boolean, pulse: true },
      reset: { path: `axMachineReset[${index}]`, dataType: DataType.Boolean, pulse: true },
      setBlank: { path: `axMachineSetBlank[${index}]`, dataType: DataType.Boolean, pulse: true },
      setDetail: { path: `axMachineSetDetail[${index}]`, dataType: DataType.Boolean, pulse: true },
      acceptDoor: { path: `axMachineAcceptDoor[${index}]`, dataType: DataType.Boolean, pulse: true },
      rejectDoor: { path: `axMachineRejectDoor[${index}]`, dataType: DataType.Boolean, pulse: true },
      acceptRun: { path: `axMachineAcceptRun[${index}]`, dataType: DataType.Boolean, pulse: true },
      rejectRun: { path: `axMachineRejectRun[${index}]`, dataType: DataType.Boolean, pulse: true },
      used: { path: `axMachineUsed[${index}]`, dataType: DataType.Boolean },
      cycleMode: { path: `xUseHmiCycleTime[${index}]`, dataType: DataType.Boolean },
      cycleTime: { path: `tMachineCycleTime[${index}]`, dataType: DataType.UInt32, transform: (v) => Math.max(1000, Math.round(Number(v) * 1000)) },
    };
    definition = machineCommands[action];
  }
  if (!definition) throw new Error(`Команда ${message.command} не разрешена`);
  const rawValue = message.value ?? true;
  const value = definition.transform ? definition.transform(rawValue) : Boolean(rawValue);
  await writeValue(definition.path, definition.dataType, value);
  if (definition.pulse) setTimeout(() => writeValue(definition.path, definition.dataType, false).catch(console.error), 150);
  return requestId;
}

async function connectOpcUa() {
  connectionState = { ...connectionState, status: 'connecting', message: 'Подключение к OPC UA', cyclogram: cyclogramHealth() };
  publishConnection();
  const client = OPCUAClient.create({
    applicationName: 'Portal Robot HMI Gateway', endpointMustExist: false, keepSessionAlive: true,
    securityMode: MessageSecurityMode.None, securityPolicy: SecurityPolicy.None,
    connectionStrategy: { initialDelay: 500, maxDelay: 2000, maxRetry: 2 },
  });
  let cyclogramCheckpoint = null;
  let cyclogramChangeTimer = null;
  try {
    await client.connect(endpointUrl);
    const session = await client.createSession();
    const gvlNodeId = await findGvlNode(session);
    symbolNodes = await collectLeafVariables(session, gvlNodeId);
    const entries = [...symbolNodes.entries()];
    latestValues = {};
    await readInitialValues(session, entries);
    const subscription = ClientSubscription.create(session, {
      requestedPublishingInterval: publishingIntervalMs, requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 20, maxNotificationsPerPublish: 1000,
      publishingEnabled: true, priority: 1,
    });
    let publishTimer = null;
    let changedValues = {};
    cyclogramCheckpoint = setInterval(() => {
      // Related PLC tags arrive as separate notifications. Recording while the
      // debounce is active would persist a half-updated state as a micro idle.
      if (cyclogramChangeTimer === null) recordCyclogram(Date.now());
    }, 100);
    const monitored = [];
    for (let offset = 0; offset < entries.length; offset += 50) {
      const chunk = entries.slice(offset, offset + 50);
      const group = ClientMonitoredItemGroup.create(
        subscription,
        chunk.map(([, nodeId]) => ({ nodeId, attributeId: AttributeIds.Value })),
        { samplingInterval: samplingIntervalMs, discardOldest: true, queueSize: 1 },
        TimestampsToReturn.Both,
      );
      group.on('changed', (_item, dataValue, index) => {
        const path = chunk[index]?.[0];
        if (!path || !dataValue.statusCode.isGood()) return;
        const value = jsonValue(dataValue.value.value);
        latestValues[path] = value;
        changedValues[path] = value;
        if (cyclogramSymbolSet.has(path)) {
          if (cyclogramChangeTimer !== null) clearTimeout(cyclogramChangeTimer);
          cyclogramChangeTimer = setTimeout(() => {
            cyclogramChangeTimer = null;
            recordCyclogram(Date.now());
          }, cyclogramSettleMs);
        }
        if (publishTimer === null) {
          publishTimer = setTimeout(() => {
            publishTimer = null;
            const delta = changedValues;
            changedValues = {};
            if (Object.keys(delta).length > 0) publishSnapshot(delta, false);
          }, uiRefreshIntervalMs);
        }
      });
      monitored.push(group);
    }

    const missing = requiredSymbols.filter((path) => !symbolNodes.has(path));
    connectionState = {
      status: missing.length ? 'degraded' : 'connected', endpoint: endpointUrl,
      message: missing.length ? 'PLC подключён, но опубликован старый состав GVL_HMI' : 'PLC подключён',
      symbols: symbolNodes.size, missing, cyclogram: cyclogramHealth(),
    };
    opcua = { client, session, subscription, monitored };
    cyclogramConnected = true;
    recordCyclogram(Date.now());
    publishConnection();
    publishSnapshot(latestValues, true);
    await new Promise((resolve) => {
      subscription.once('terminated', resolve);
      client.once('connection_lost', resolve);
    });
  } finally {
    if (cyclogramCheckpoint !== null) clearInterval(cyclogramCheckpoint);
    if (cyclogramChangeTimer !== null) clearTimeout(cyclogramChangeTimer);
    if (publishTimer !== null) clearTimeout(publishTimer);
    cyclogramConnected = false;
    stopCyclogram(Date.now());
    opcua = null;
    symbolNodes = new Map();
    try { await client.disconnect(); } catch { /* reconnect below */ }
  }
}

async function opcUaLoop() {
  while (true) {
    try {
      await connectOpcUa();
    } catch (error) {
      connectionState = {
        status: 'disconnected', endpoint: endpointUrl,
        message: error instanceof Error ? error.message : String(error),
        symbols: 0, missing: requiredSymbols, cyclogram: cyclogramHealth(),
      };
      publishConnection();
      console.error(`[OPC UA] ${connectionState.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, reconnectDelayMs));
  }
}

const httpServer = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://gateway.local');
  if (requestUrl.pathname === '/api/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ...connectionState, cyclogram: cyclogramHealth() }));
    return;
  }
  if (requestUrl.pathname === '/api/cyclogram/export') {
    if (!cyclogramStore) {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: cyclogramError || 'Хранилище циклограммы недоступно' }));
      return;
    }
    const now = Date.now();
    const scope = requestUrl.searchParams.get('scope') ?? 'all';
    const requestedFrom = Number(requestUrl.searchParams.get('from'));
    const requestedTo = Number(requestUrl.searchParams.get('to'));
    const rangeFrom = scope === 'all' ? now - cyclogramStore.retentionMs : requestedFrom;
    const rangeTo = scope === 'all' ? now : requestedTo;
    if (!Number.isFinite(rangeFrom) || !Number.isFinite(rangeTo) || rangeFrom >= rangeTo) {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Некорректный временной диапазон циклограммы' }));
      return;
    }
    try {
      const from = Math.max(now - cyclogramStore.retentionMs, Math.round(rangeFrom));
      const to = Math.min(now, Math.round(rangeTo));
      if (from >= to) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Запрошенный диапазон находится вне доступной истории циклограммы' }));
        return;
      }
      const buffer = await createCyclogramWorkbook(cyclogramStore.intervals({ fromMs: from, toMs: to, nowMs: now }), {
        fromMs: from, toMs: to, exportedAtMs: now, timeZone: cyclogramTimeZone,
      });
      response.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${cyclogramExportFilename(now, cyclogramTimeZone)}"`,
        'Content-Length': buffer.length,
      });
      response.end(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: message }));
    }
    return;
  }
  const requestPath = requestUrl.pathname === '/' ? '/index.html' : decodeURIComponent(requestUrl.pathname);
  const relativePath = normalize(requestPath).replace(/^([/\\])+/, '');
  let filePath = normalize(join(distDir, relativePath));
  if (!filePath.startsWith(distDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(distDir, 'index.html');
  if (!existsSync(filePath)) {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Сначала выполните npm run build');
    return;
  }
  response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
});

const webSocketServer = new WebSocketServer({ server: httpServer, path: '/ws' });
webSocketServer.on('connection', (socket) => {
  send(socket, { type: 'connection', ...connectionState });
  send(socket, { type: 'snapshot', timestamp: Date.now(), full: true, values: latestValues });
  if (cyclogramStore) {
    publishCyclogramHistory(socket);
  }
  socket.on('message', async (payload) => {
    let message;
    try {
      message = JSON.parse(payload.toString());
      if (message.type === 'cyclogram-clear') {
        const requestId = String(message.requestId ?? Date.now());
        clearCyclogram(Date.now());
        send(socket, { type: 'ack', requestId, ok: true });
        return;
      }
      if (message.type !== 'command') return;
      const requestId = await executeCommand(message);
      send(socket, { type: 'ack', requestId, ok: true });
    } catch (error) {
      send(socket, { type: 'ack', requestId: String(message?.requestId ?? ''), ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
});

httpServer.listen(gatewayPort, gatewayHost, () => {
  console.log(`[Gateway] http://${gatewayHost}:${gatewayPort}`);
  console.log(`[OPC UA] ${endpointUrl}`);
});

opcUaLoop().catch(console.error);

process.once('SIGINT', () => cyclogramStore?.closeDatabase());
process.once('SIGTERM', () => cyclogramStore?.closeDatabase());
