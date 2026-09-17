// Receipt is distinct from technological acceptance or completion of motion.
// One writer (gateway), one consumer (PLC); never retry a committed request.
export class AcknowledgedCommand {
  constructor({ read, write, now = Date.now, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 5000 }) {
    Object.assign(this, { read, write, now, pause, timeoutMs });
    this.busy = new Set();
  }

  async exclusive(key, protocols, work) {
    if (this.busy.has(key)) throw new Error('PLC ещё обрабатывает предыдущую команду этого канала');
    this.busy.add(key);
    try {
      for (const protocol of protocols) {
        const state = await this.read([protocol.request, protocol.ack]);
        this.assertIdle(protocol, state);
      }
      return await work();
    } finally {
      this.busy.delete(key);
    }
  }

  assertIdle(protocol, state) {
    for (const path of [protocol.request, protocol.ack]) {
      if (!Number.isInteger(state[path]) || state[path] < 0 || state[path] > 0xffffffff) {
        throw new Error(`PLC не опубликовал корректный счётчик ${path}`);
      }
    }
    if (state[protocol.request] !== state[protocol.ack]) {
      throw new Error('Предыдущая команда ещё не подтверждена PLC; повторная отправка запрещена');
    }
  }

  async run(protocol, prepare = async () => {}, verify = () => {}) {
    return this.exclusive(protocol.request, [], async () => {
      const before = await this.read([protocol.request, protocol.ack]);
      this.assertIdle(protocol, before);
      const sequence = ((before[protocol.ack] + 1) >>> 0) || 1;
      await prepare();
      if (protocol.issued) {
        const clock = await this.read(['udiHmiCommandClockMs']);
        const issued = clock.udiHmiCommandClockMs;
        if (!Number.isInteger(issued) || issued < 0 || issued > 0xffffffff) throw new Error('PLC не опубликовал часы канала команд');
        await this.write(protocol.issued, issued);
      }
      await this.write(protocol.request, sequence);
      const deadline = this.now() + this.timeoutMs;
      do {
        // Read Ack first. PLC publishes its result before Ack. A single multi-read
        // could otherwise mix an old result with a new Ack across the scan.
        const receipt = await this.read([protocol.ack]);
        if (receipt[protocol.ack] === sequence) {
          const result = protocol.result ? await this.read([protocol.result]) : {};
          verify(result[protocol.result]);
          return sequence;
        }
        await this.pause(40);
      } while (this.now() < deadline);
      throw new Error('PLC не подтвердил команду; результат неизвестен, автоматический повтор запрещён');
    });
  }
}
