import { ioCatalog } from './physical-io.mjs';
const validDoIndices = new Set(ioCatalog.filter((c) => c.direction === 'DO').map((c) => c.index));

// У I/O и программного останова независимые писатели; Seq последним, затем Ack/Result.
export class IoOverrideChannel {
  constructor({ read, write, emergency = false, now = Date.now, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 5000 }) {
    Object.assign(this, { read, write, emergency, now, pause, timeoutMs });
    this.busy = false;
  }
  async run({ action, index = 0, value = false }) {
    const actions = this.emergency ? [1, 2] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const indexed = !this.emergency && [1, 2, 4, 5].includes(action);
    if (!actions.includes(action) || (indexed && (!Number.isInteger(index) || index < 1 || index > (action < 4 ? 84 : 50)))
        || (indexed && action >= 4 && !validDoIndices.has(index)) || typeof value !== 'boolean') throw new Error('Недопустимая команда I/O');
    if (this.busy) throw new Error('PLC ещё подтверждает предыдущую команду I/O');
    this.busy = true;
    try {
      const prefix = this.emergency ? 'IoEmergency' : 'IoOverride';
      const seq = `udi${prefix}CommandSeq`, ack = `udi${prefix}AckSeq`, result = `ui${prefix}Result`;
      const before = await this.read();
      if (!Number.isInteger(before[ack]) || !Number.isInteger(before.udiHmiCommandClockMs)
          || before[seq] !== before[ack]) throw new Error('Предыдущая команда I/O ещё не подтверждена PLC');
      const sequence = ((before[ack] + 1) >>> 0) || 1;
      if (!this.emergency) await this.write('uiIoOverrideIndex', index);
      await this.write(`ui${prefix}Action`, action);
      if (!this.emergency) await this.write('xIoOverrideValue', value);
      await this.write(`udi${prefix}IssuedAtMs`, before.udiHmiCommandClockMs);
      await this.write(seq, sequence);
      const deadline = this.now() + this.timeoutMs;
      do {
        const reply = await this.read();
        if (reply[ack] === sequence) {
          if (reply[result] === 1) return { sequence, result: 1 };
          const reason = { 2: 'Ручное управление запрещено PLC: остановите ячейку, выберите ручной режим и включите управление сигналами',
            3: 'PLC отклонил индекс или действие I/O', 4: 'PLC отклонил просроченную команду I/O' };
          throw new Error(this.emergency && reply[result] === 2 ? 'PLC запрещает снятие экстренного останова: дождитесь останова и восстановите безопасность'
            : reason[reply[result]] ?? `Неизвестный результат I/O: ${reply[result]}`);
        }
        await this.pause(40);
      } while (this.now() < deadline);
      throw new Error('PLC не подтвердил команду I/O: проверьте состояние подмены');
    } finally {
      this.busy = false;
    }
  }
}
