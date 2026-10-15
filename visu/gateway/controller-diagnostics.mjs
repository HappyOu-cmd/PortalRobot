import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';

// Read operations observed in the MC522 PLC-Web frontend (firmware V1.2.0.2).
// Keep an allowlist: other CGI GET endpoints can reboot or reset the controller.
const READS = {
  resources: ['/cgi-bin/system?key=cpuinfo', 'cpuinfo'],
  identity: ['/cgi-bin/devinfo?key=device', 'device'],
  modules: ['/cgi-bin/module?key=modulemessage', 'modulemessage'],
};
const MAX_RESPONSE_BYTES = 256 * 1024;

export function controllerWebOptions(endpoint, configPath, env = process.env) {
  let saved = {};
  try {
    if (configPath) saved = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error();
  } catch (error) {
    if (error.code !== 'ENOENT') return { enabled: false, url: '', error: 'Не удалось прочитать настройки диагностики контроллера' };
  }
  if (env.CONTROLLER_WEB_ENABLED === '0' || saved.enabled === false) return { enabled: false, url: '', error: null };
  try {
    const host = new URL(endpoint).hostname;
    const url = new URL(env.CONTROLLER_WEB_URL ?? saved.url ?? `http://${host}:8090`);
    if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    const username = env.CONTROLLER_WEB_USERNAME ?? saved.username;
    const password = env.CONTROLLER_WEB_PASSWORD ?? saved.password;
    if (typeof username !== 'string' || !username || username.includes(':') || typeof password !== 'string' || !password) {
      return { enabled: false, url: url.origin, error: 'Не настроена учётная запись веб-сервиса контроллера' };
    }
    return { enabled: true, url: url.origin, username, password, timeoutMs: 3_000, error: null };
  } catch {
    return { enabled: false, url: '', error: 'Некорректный адрес веб-сервиса контроллера' };
  }
}

function webError(message, status = 'offline') {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function parseControllerResponse(raw, field) {
  const boundary = raw.indexOf('\r\n\r\n');
  if (boundary < 0) throw webError('Неполный HTTP-ответ контроллера');
  const headers = raw.subarray(0, boundary).toString('ascii');
  const status = /^HTTP\/1\.[01] (\d{3})\b/.exec(headers)?.[1];
  if (status === '401' || status === '403') throw webError('Веб-сервис контроллера отклонил авторизацию', 'unauthorized');
  if (status !== '200') throw webError(`Веб-сервис контроллера: HTTP ${status ?? 'неизвестен'}`);
  if (/transfer-encoding\s*:/i.test(headers)) throw webError('Неподдерживаемый формат HTTP-ответа контроллера');
  const body = raw.subarray(boundary + 4);
  const length = /^content-length:\s*(\d+)\s*$/im.exec(headers)?.[1];
  if (length !== undefined && Number(length) !== body.length) throw webError('Неполный HTTP-ответ контроллера');
  let payload;
  try { payload = JSON.parse(body.toString('utf8')); }
  catch { throw webError('Веб-сервис контроллера вернул некорректный JSON'); }
  if (payload?.error !== false || payload?.data?.[field] === undefined) throw webError(`Нет данных контроллера: ${field}`);
  return payload.data[field];
}

export function readControllerCgi(options, section) {
  if (!Object.hasOwn(READS, section)) return Promise.reject(webError('Недопустимый запрос диагностики'));
  const [path, field] = READS[section];
  const url = new URL(options.url);
  if (url.protocol !== 'http:' || url.username || url.password) return Promise.reject(webError('Некорректный адрес веб-сервиса контроллера'));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let ended = false;
    // This firmware sends "Content-type text/json" WITHOUT a colon. Neither
    // fetch nor Node's insecureHTTPParser accepts it. HTTP/1.0 + Connection:
    // close lets us read a bounded response without weakening other clients.
    const socket = createConnection({ host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 80) });
    const deadline = setTimeout(() => socket.destroy(webError('Веб-сервис контроллера не ответил за отведённое время')), options.timeoutMs ?? 3_000);
    socket.once('close', () => {
      clearTimeout(deadline);
      if (!ended) reject(webError('Связь с веб-сервисом контроллера прервана'));
    });
    socket.once('error', (error) => reject(error.status ? error : webError('Нет связи с веб-сервисом контроллера')));
    socket.once('connect', () => {
      const auth = Buffer.from(`${options.username}:${options.password}`).toString('base64');
      socket.write(`GET ${path} HTTP/1.0\r\nHost: ${url.host}\r\nAuthorization: Basic ${auth}\r\nAccept: application/json\r\nConnection: close\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES) socket.destroy(webError('Слишком большой ответ веб-сервиса контроллера'));
      else chunks.push(chunk);
    });
    socket.once('end', () => {
      ended = true;
      try { resolve(parseControllerResponse(Buffer.concat(chunks), field)); }
      catch (error) { reject(error); }
    });
  });
}

const number = (value, min, max) => {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : null;
};
const text = (value) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null;
const flag = (value) => value === 1 || value === '1' ? true : value === 0 || value === '0' ? false : null;

// Translated from the MC522 PLC-Web maintenance table. These are current LED
// states, not PLC alarm codes or a history of CODESYS exceptions.
const LED_STATES = {
  '00': 'Ошибок нет', '22': 'Ошибка запуска системы', '23': 'Ошибка инициализации системы',
  '24': 'Ошибка периферийного порта', '25': 'Перегрев CPU', '26': 'Потеря связи с шиной расширения',
  '27': 'Ошибка связи резервирования', '32': 'Ошибка мастера EtherCAT',
  '35': 'Ошибка узла Ethernet', '36': 'Ошибка контроллера PROFINET', '37': 'Ошибка устройства PROFINET',
  '39': 'Ошибка сканера EtherNet/IP', '3A': 'Ошибка адаптера EtherNet/IP',
  '3C': 'Ошибка узла CAN', '3D': 'Ошибка мастера CANopen', '3E': 'Ошибка устройства CANopen',
  '3F': 'Ошибка мастера Modbus TCP', '40': 'Ошибка устройства Modbus TCP',
  '42': 'Ошибка узла Modbus RTU', '43': 'Ошибка мастера Modbus RTU', '44': 'Ошибка устройства Modbus RTU',
  '45': 'Нет связи с MBS', '46': 'Ошибка модуля MBS', '47': 'Превышено число модулей MBS',
  '48': 'Превышено число устройств MBS', '5A': 'Приложение остановлено',
  '5B': 'Исключение приложения: проверьте журнал CODESYS', '5C': 'Приложение занимает слишком много памяти',
  '67': 'Превышено число модулей расширения', '72': 'Ошибка встроенного I/O',
  '73': 'Несоответствие конфигурации I/O', '74': 'Ошибка питания модуля расширения',
  '75': 'Перегрузка по току или температуре модуля расширения', '76': 'Ошибка оконечного модуля',
  '77': 'Ошибка канала модуля расширения', '78': 'Ошибка встроенного I/O',
};

export function controllerLedState(value) {
  const code = text(value)?.toUpperCase() ?? null;
  return { code, message: code === null ? null : LED_STATES[code] ?? 'Неизвестный код производителя', normal: code === null ? null : code === '00' };
}

export function controllerModuleState(value) {
  const messages = ['Ошибок нет', 'Несоответствие конфигурации', 'Ошибка питания', 'Перегрузка по току или температуре', 'Ошибка оконечного модуля', 'Ошибка канала'];
  return messages[value] ?? (value === null ? 'Нет данных' : 'Код производителя');
}

export function normalizeControllerResources(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !['cpu', 'ram', 'rom', 'led', 'runstate'].some((key) => Object.hasOwn(raw, key))) {
    throw webError('Некорректные показатели ресурсов контроллера');
  }
  return {
    cpuLoadPercent: number(raw.cpu, 0, 100), memoryUsedPercent: number(raw.ram, 0, 100),
    storageUsedPercent: number(raw.rom, 0, 100), temperatureCelsius: number(raw.cputemp, -50, 200),
    uptime: text(raw.uptime), applicationRunning: flag(raw.runstate), debugMode: flag(raw.debugValue),
    networkTxKbPerSecond: number(raw.net0up, 0, Number.MAX_SAFE_INTEGER),
    networkRxKbPerSecond: number(raw.net0down, 0, Number.MAX_SAFE_INTEGER),
    led: controllerLedState(raw.led),
  };
}

function normalizeIdentity(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !text(raw.devicetype)) throw webError('Некорректный паспорт контроллера');
  return {
    name: text(raw.devicename), model: text(raw.devicetype), serialNumber: text(raw.serialnumber),
    firmwareVersion: text(raw.softwareversion), hardwareVersion: text(raw.hardwareversion),
    busVersion: text(raw.busversion), highSpeedIoVersion: text(raw.higspeedIOversion),
    buildDate: text(raw.builddate), vendor: text(raw.vendorName),
  };
}

function normalizeModules(raw) {
  if (!Array.isArray(raw) || raw.length > 128) throw webError('Некорректный список модулей контроллера');
  return raw.map((item) => {
    const slot = number(item?.slave, 0, 255);
    if (!Number.isInteger(slot)) throw webError('Некорректный номер модуля контроллера');
    const type = number(item.type, 0, 65535);
    const errorCode = number(item.error, 0, 65535);
    const code = Number.isInteger(errorCode) ? errorCode : null;
    return { slot, type: Number.isInteger(type) ? type : null, errorCode: code, message: controllerModuleState(code) };
  });
}

export class ControllerDiagnostics {
  constructor(options, read = readControllerCgi) {
    this.options = options;
    this.read = read;
    this.state = {
      url: options.url, status: options.enabled ? 'connecting' : 'disabled', observedAt: null,
      error: options.error, resources: null,
      identity: { observedAt: null, error: null, data: null },
      modules: { observedAt: null, error: null, data: null },
    };
    this.lastIdentityAttempt = null;
    this.lastModulesAttempt = null;
  }

  async poll(now = Date.now()) {
    if (!this.options.enabled) return this.state;
    const sections = ['resources'];
    if (this.lastIdentityAttempt === null || now - this.lastIdentityAttempt >= 60_000) {
      sections.push('identity'); this.lastIdentityAttempt = now;
    }
    if (this.lastModulesAttempt === null || now - this.lastModulesAttempt >= 5_000) {
      sections.push('modules'); this.lastModulesAttempt = now;
    }
    const normalize = { resources: normalizeControllerResources, identity: normalizeIdentity, modules: normalizeModules };
    const results = await Promise.allSettled(sections.map(async (section) => normalize[section](await this.read(this.options, section))));
    const state = { ...this.state };
    sections.forEach((section, index) => {
      const result = results[index];
      if (section === 'resources') {
        state.status = result.status === 'fulfilled' ? 'online' : result.reason?.status ?? 'offline';
        state.observedAt = result.status === 'fulfilled' ? now : null;
        state.error = result.status === 'fulfilled' ? null : result.reason.message;
        state.resources = result.status === 'fulfilled' ? result.value : null;
      } else {
        state[section] = {
          observedAt: result.status === 'fulfilled' ? now : null,
          error: result.status === 'fulfilled' ? null : result.reason.message,
          data: result.status === 'fulfilled' ? result.value : null,
        };
      }
    });
    this.state = state;
    return state;
  }
}
