export const cellModeSymbols = [
  'xCellManualRequest', 'udiCellModeCommandSeq', 'udiCellModeAckSeq',
  'uiCellModeResult', 'xCellManual',
];

// Один буфер запроса: не перезаписываем payload до подтверждения PLC,
// в том числе после timeout или перезапуска gateway с незавершённой командой.
export class CellModeChannel {
  constructor({ read, write, now = Date.now, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 5000 }) {
    Object.assign(this, { read, write, now, pause, timeoutMs });
    this.busy = false;
  }

  async run(manual) {
    if (typeof manual !== 'boolean') throw new Error('Режим ячейки должен быть boolean');
    if (this.busy) throw new Error('PLC ещё подтверждает предыдущее переключение режима');
    this.busy = true;
    try {
      const before = await this.read();
      if (before.udiCellModeCommandSeq !== before.udiCellModeAckSeq) {
        throw new Error('Предыдущее переключение режима ещё не подтверждено PLC');
      }
      const sequence = ((Number(before.udiCellModeAckSeq) + 1) >>> 0) || 1;
      await this.write('xCellManualRequest', manual);
      await this.write('udiCellModeCommandSeq', sequence);
      const deadline = this.now() + this.timeoutMs;
      do {
        const result = await this.read();
        if (result.udiCellModeAckSeq === sequence) {
          if (result.uiCellModeResult === 1) return;
          if (result.uiCellModeResult === 2) throw new Error('Переключение в ручной режим отклонено: сначала остановите автоматический цикл');
          if (result.uiCellModeResult === 3) throw new Error('Переключение в автоматический режим отклонено: общая авария активна');
          throw new Error(`PLC вернул неизвестный результат переключения режима: ${result.uiCellModeResult}`);
        }
        await this.pause(40);
      } while (this.now() < deadline);
      throw new Error('PLC не подтвердил переключение режима: проверьте фактический режим ячейки');
    } finally {
      this.busy = false;
    }
  }
}
