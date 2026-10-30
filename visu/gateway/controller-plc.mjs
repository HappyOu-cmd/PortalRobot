import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import alarmCatalog from '../alarm-catalog.json' with { type: 'json' };

const mapping = alarmCatalog.controllerDiagnostics;
const REQUEST = 'stControllerWebRequest';
const ACK = 'stControllerWebStatus.udiAckSeq';
const CLOCK = 'udiHmiCommandClockMs';
const FIELDS = {
  udiIssuedAtMs: 'UInt32', xCpuValid: 'Boolean', xModulesValid: 'Boolean',
  dwCpuCurrent1: 'UInt32', dwCpuCurrent2: 'UInt32', dwModuleCurrent: 'UInt32', xMemoryCurrent: 'Boolean',
  dwCpuObserved1: 'UInt32', dwCpuObserved2: 'UInt32', dwModuleObserved: 'UInt32', xMemoryObserved: 'Boolean',
};
export const controllerPlcSymbols = [ACK, ...Object.keys(FIELDS).map((field) => `${REQUEST}.${field}`), `${REQUEST}.udiSequence`,
  ...['dwCpuAlarm1', 'dwCpuAlarm2', 'dwModuleAlarm', 'xMemoryWarning', 'xCpuFresh', 'xModulesFresh',
    'xAlarmActive', 'xGlobalStopRequired', 'xResetAllowed', 'xWarningResetAllowed'].map((field) => `stControllerWebStatus.${field}`)];

export function controllerHardwareKey(code) {
  const parts = code.split(':');
  if (parts[0] !== 'controller') return null;
  if (parts[1] === 'led') {
    const cpuCode = code.slice('controller:led:'.length);
    if (cpuCode === 'unknown' || cpuCode === '00') return null;
    if (cpuCode === '5C') return { source: mapping.cpuSources[0], code: mapping.memoryWarningCode, severity: 'warning' };
    let index = mapping.cpuAlarmCodes.indexOf(cpuCode);
    if (index < 0) index = mapping.cpuAlarmCodes.indexOf('*');
    return { source: mapping.cpuSources[Math.floor(index / 32)], code: index % 32, severity: 'alarm' };
  }
  if (parts[1] === 'module' && parts.length === 4) {
    const error = Number(parts[3]);
    if (!Number.isInteger(error) || error <= 0) return null;
    return { source: mapping.moduleSource, code: error <= 5 ? error - 1 : 5, severity: 'alarm' };
  }
  return null;
}

function masks(keys) {
  const result = { cpu1: 0, cpu2: 0, modules: 0, memory: false };
  for (const key of keys) {
    const event = controllerHardwareKey(key);
    if (!event) continue;
    if (event.severity === 'warning') result.memory = true;
    else if (event.source === mapping.moduleSource) result.modules = (result.modules | (1 << event.code)) >>> 0;
    else if (event.source === mapping.cpuSources[0]) result.cpu1 = (result.cpu1 | (1 << event.code)) >>> 0;
    else result.cpu2 = (result.cpu2 | (1 << event.code)) >>> 0;
  }
  return result;
}

export function controllerPlcPayload(state, now) {
  const cpuValid = state?.status === 'online' && state.resources?.led.code != null
    && state.observedAt != null && now - state.observedAt >= 0 && now - state.observedAt <= 10_000;
  const modules = state?.modules;
  const moduleValid = modules?.data != null && !modules.error && modules.observedAt != null
    && now - modules.observedAt >= 0 && now - modules.observedAt <= 15_000
    && modules.data.every((module) => module.errorCode !== null)
    && !(state.alarms ?? []).some((alarm) => alarm.active && alarm.stale && alarm.code.startsWith('controller:module:'));
  const current = [];
  if (cpuValid && state.resources.led.normal === false) current.push(`controller:led:${state.resources.led.code}`);
  if (moduleValid) for (const module of modules.data) if (module.errorCode > 0) current.push(`controller:module:${module.slot}:${module.errorCode}`);
  const value = masks(current);
  return { xCpuValid: Boolean(cpuValid), xModulesValid: Boolean(moduleValid),
    dwCpuCurrent1: value.cpu1, dwCpuCurrent2: value.cpu2, dwModuleCurrent: value.modules, xMemoryCurrent: value.memory };
}

// One immutable frame is kept until its PLC Ack. The optional local outbox also
// preserves observations and ambiguous writes across a gateway restart.
export class ControllerPlcBridge {
  constructor({ read, write, available, statePath = null }) {
    Object.assign(this, { read, write, available, statePath });
    this.pending = new Map();
    this.moduleFaults = new Map();
    this.seen = new Set();
    this.frame = null;
    this.state = null;
    this.dirty = false;
    this.busy = false;
    this.lastSentAt = -Infinity;
    this.status = { status: 'waiting', error: null, ackSeq: null };
    try {
      if (statePath && existsSync(statePath)) {
        const saved = JSON.parse(readFileSync(statePath, 'utf8'));
        if (saved.version !== 1 || !Array.isArray(saved.pending) || !Array.isArray(saved.seen)) throw new Error();
        if (!saved.pending.every(([id, code]) => typeof id === 'string' && typeof code === 'string' && controllerHardwareKey(code))) throw new Error();
        if (saved.frame && (!Number.isInteger(saved.frame.sequence) || saved.frame.sequence < 1 || saved.frame.sequence > 0xffffffff
          || !Array.isArray(saved.frame.ids) || !Object.entries(FIELDS).every(([name, type]) => type === 'Boolean'
            ? typeof saved.frame.payload?.[name] === 'boolean'
            : Number.isInteger(saved.frame.payload?.[name]) && saved.frame.payload[name] >= 0 && saved.frame.payload[name] <= 0xffffffff))) throw new Error();
        this.pending = new Map(saved.pending);
        if (saved.moduleFaults && (!Array.isArray(saved.moduleFaults) || !saved.moduleFaults.every(([slot, code]) =>
          Number.isInteger(slot) && slot >= 0 && slot <= 255 && Number.isInteger(code) && code > 0 && code <= 65535))) throw new Error();
        this.moduleFaults = new Map(saved.moduleFaults ?? []);
        this.seen = new Set(saved.seen);
        this.frame = saved.frame;
      }
    } catch { this.storageError = 'Не удалось прочитать очередь системных аварий для PLC'; }
  }

  persist() {
    if (!this.statePath) return;
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      const temporary = `${this.statePath}.tmp`;
      writeFileSync(temporary, JSON.stringify({ version: 1, pending: [...this.pending], moduleFaults: [...this.moduleFaults], seen: [...this.seen], frame: this.frame }), 'utf8');
      renameSync(temporary, this.statePath);
    } catch {
      this.storageError = 'Не удалось сохранить очередь системных аварий для PLC';
      throw new Error(this.storageError);
    }
  }

  observe(state) {
    this.state = state;
    this.dirty = true;
    // Keep faulty slot identities after Ack and across process restarts. A slot
    // disappearing from a later list is not a confirmation of its recovery.
    for (const module of state.modules?.data ?? []) {
      if (module.errorCode === 0) this.moduleFaults.delete(module.slot);
      else if (Number.isInteger(module.errorCode) && module.errorCode > 0) this.moduleFaults.set(module.slot, module.errorCode);
    }
    for (const alarm of state.alarms ?? []) {
      if (!alarm.active || !controllerHardwareKey(alarm.code) || this.seen.has(alarm.id)) continue;
      this.seen.add(alarm.id);
      this.pending.set(alarm.id, alarm.code);
    }
    this.seen = new Set([...this.seen].slice(-1024));
    try { if (!this.storageError) this.persist(); }
    catch { this.storageError = 'Не удалось сохранить очередь системных аварий для PLC'; }
  }

  async flush(now = Date.now()) {
    if (this.busy || !this.state) return this.status;
    this.busy = true;
    try {
      if (this.storageError) throw new Error(this.storageError);
      if (!this.available()) { this.status = { ...this.status, status: 'waiting', error: 'Ожидается связь с работающим PLC' }; return this.status; }
      const values = await this.read([ACK, CLOCK, `${REQUEST}.udiSequence`]);
      const ack = Number(values[ACK]);
      const clock = Number(values[CLOCK]);
      const request = Number(values[`${REQUEST}.udiSequence`]);
      if (![ack, clock, request].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) throw new Error('Некорректный ответ канала диагностики PLC');
      if (this.frame && ack === this.frame.sequence) {
        for (const id of this.frame.ids) this.pending.delete(id);
        this.frame = null;
        this.persist();
        this.status = { status: 'synchronized', error: null, ackSeq: ack };
      }
      // A previous process may have committed a frame immediately before exit.
      // Never overwrite an unacknowledged payload with different values.
      if (!this.frame && request !== 0 && request !== ack) {
        this.status = { status: 'pending', error: 'PLC ещё не подтвердил предыдущий пакет диагностики', ackSeq: ack };
        return this.status;
      }
      if (!this.frame) {
        if (!this.dirty && now - this.lastSentAt < 3_000) return this.status;
        const observed = masks(this.pending.values());
        const current = controllerPlcPayload(this.state, now);
        if ([...this.moduleFaults.keys()].some((slot) => !this.state.modules?.data?.some((module) => module.slot === slot && module.errorCode !== null))) {
          current.xModulesValid = false;
        }
        this.frame = { sequence: ((ack + 1) >>> 0) || 1, ids: [...this.pending.keys()],
          payload: { udiIssuedAtMs: clock, ...current, dwCpuObserved1: observed.cpu1,
            dwCpuObserved2: observed.cpu2, dwModuleObserved: observed.modules, xMemoryObserved: observed.memory } };
        this.dirty = false;
        this.persist();
      }
      if (now - this.lastSentAt < 1_000) return this.status;
      for (const [field, type] of Object.entries(FIELDS)) await this.write(`${REQUEST}.${field}`, type, this.frame.payload[field]);
      await this.write(`${REQUEST}.udiSequence`, 'UInt32', this.frame.sequence);
      this.lastSentAt = now;
      this.status = { status: 'pending', error: null, ackSeq: ack };
    } catch (error) { this.status = { ...this.status, status: 'error', error: error instanceof Error ? error.message : String(error) }; }
    finally { this.busy = false; }
    return this.status;
  }
}
