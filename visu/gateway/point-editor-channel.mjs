// One OPC draft buffer has exactly one writer until the PLC acknowledges it.
// On an ambiguous timeout, do not overwrite that buffer with a new transaction.
export class PointEditorChannel {
  constructor({ ack, readResult, now = Date.now, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 5000 }) {
    Object.assign(this, { ack, readResult, now, pause, timeoutMs });
    this.busy = false;
    this.activeSequence = 0;
    this.settled = Promise.resolve();
    this.uncertain = 0;
  }
  async run(message, execute) {
    while (this.busy) {
      // The PLC ack is published before the gateway finishes its result read.
      // Let the next import item wait for that tiny hand-off window instead of
      // rejecting it as a concurrent writer.
      if (!this.activeSequence || this.ack() !== this.activeSequence) {
        throw new Error('Редактор ожидает подтверждения предыдущей команды PLC');
      }
      await this.settled;
    }
    if (this.uncertain && this.ack() !== this.uncertain) throw new Error('Редактор ожидает подтверждения предыдущей команды PLC');
    this.uncertain = 0;
    this.busy = true;
    let resolveSettled;
    this.settled = new Promise((resolve) => { resolveSettled = resolve; });
    try {
      message._assertAuthorized?.();
      const requestId = await execute(message);
      const sequence = message._pointEditorSequence;
      this.activeSequence = sequence;
      const deadline = this.now() + this.timeoutMs;
      while (this.ack() !== sequence && this.now() < deadline) await this.pause(40);
      if (this.ack() !== sequence) throw new Error('PLC не подтвердил команду редактора. Не повторяйте движение до проверки состояния');
      const result = await this.readResult(sequence);
      message._pointEditorResult = result.point;
      message._pointEditorConfirmed = true;
      if (result.result !== 1) throw new Error(result.reason || 'PLC отклонил команду редактора');
      return requestId;
    } catch (error) {
      if (message._pointEditorSequence && !message._pointEditorConfirmed) this.uncertain = message._pointEditorSequence;
      throw error;
    } finally {
      this.busy = false;
      this.activeSequence = 0;
      resolveSettled();
    }
  }
}
