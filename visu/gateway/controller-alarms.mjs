// These events belong to the HMI. They never write commands or PLC alarm bits.
export class ControllerAlarmTracker {
  constructor(recordEvent = () => {}) {
    this.recordEvent = recordEvent;
    this.active = new Map();
    this.history = [];
    this.known = new Set();
    this.sequence = 0;
  }

  observe(key, condition, now) {
    const current = this.active.get(key);
    // Missing telemetry cannot confirm that a previously observed fault cleared.
    if (condition === undefined) {
      if (current) this.active.set(key, { ...current, stale: true });
      return;
    }
    const observedOnConnect = !this.known.has(key);
    this.known.add(key);
    if (current && condition?.code === current.code) {
      this.active.set(key, { ...current, text: condition.text, stale: false });
      return;
    }
    if (current) {
      const restored = { ...current, active: false, stale: false };
      this.history.unshift(restored);
      this.active.delete(key);
      this.record(restored, 'restored', now, false, condition?.code ?? null);
    }
    if (condition) {
      const alarm = {
        ...condition, id: `controller:${now}:${++this.sequence}`, source: 'controller',
        effect: 'notification', active: true, stale: false, reportedAt: now,
      };
      this.active.set(key, alarm);
      this.record(alarm, 'active', now, observedOnConnect);
    }
  }

  record(alarm, status, timestampMs, observedOnConnect, replacedByCode = null) {
    const hardware = (alarm.code.startsWith('controller:led:') && alarm.code !== 'controller:led:unknown')
      || alarm.code.startsWith('controller:module:');
    const label = hardware ? alarm.severity === 'alarm' ? 'Системная авария MC522' : 'Системное предупреждение MC522'
      : alarm.severity === 'alarm' ? 'Авария HMI' : 'Предупреждение HMI';
    const restored = replacedByCode ? ' больше не сообщается' : alarm.severity === 'alarm' ? ' устранена' : ' устранено';
    this.recordEvent({
      timestampMs, sourceId: 8, eventType: alarm.severity, status, code: alarm.code,
      message: `${label}${status === 'restored' ? restored : ''}: ${alarm.text}`,
      oldValue: status === 'restored', newValue: status === 'active',
      details: { origin: 'controller-web', effect: hardware ? 'PLC_DIAGNOSTIC_INPUT' : 'HMI_NOTIFICATION', observedOnConnect, replacedByCode },
    });
  }

  update(controller, now) {
    const fault = (code, text, severity = 'alarm') => ({ code: `controller:${code}`, text, severity });
    const resources = controller.status === 'online' ? controller.resources : null;
    if (resources) {
      const led = resources.led;
      this.observe('led', led.normal === null ? undefined : led.normal ? null
        : fault(`led:${led.code}`, `Код CPU ${led.code}: ${led.message}`, led.code === '5C' ? 'warning' : 'alarm'), now);
      this.observe('led-data', led.code === null
        ? fault('led:unknown', 'Веб-сервис контроллера не сообщил код индикатора CPU', 'warning') : null, now);
      this.observe('web', null, now);
    } else {
      this.observe('led', undefined, now);
      this.observe('led-data', undefined, now);
      this.observe('web', ['offline', 'unauthorized'].includes(controller.status)
        ? fault(`web:${controller.status}`, controller.error ?? 'Нет связи с веб-сервисом контроллера', 'warning')
        : undefined, now);
    }

    const modules = controller.modules.data;
    const keys = new Set([...this.active.keys()].filter((key) => key.startsWith('module:')));
    if (modules !== null) {
      for (const module of modules) keys.add(`module:${module.slot}`);
      let incomplete = false;
      for (const key of keys) {
        const module = modules.find((item) => key === `module:${item.slot}`);
        if (!module || module.errorCode === null) incomplete = true;
        this.observe(key, !module || module.errorCode === null ? undefined : module.errorCode === 0 ? null
          : fault(`module:${module.slot}:${module.errorCode}`, `Модуль ${module.slot}, код ${module.errorCode}: ${module.message}`), now);
      }
      this.observe('modules-read', incomplete
        ? fault('modules:unknown', 'Веб-сервис контроллера сообщил неполное состояние модулей', 'warning') : null, now);
    } else {
      for (const key of keys) this.observe(key, undefined, now);
      this.observe('modules-read', controller.modules.error
        ? fault('modules:unavailable', `Не удалось прочитать модули контроллера: ${controller.modules.error}`, 'warning') : undefined, now);
    }
    this.history = this.history.slice(0, 100);
    return [...this.active.values(), ...this.history].sort((left, right) => right.reportedAt - left.reportedAt);
  }
}
