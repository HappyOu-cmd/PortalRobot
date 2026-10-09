import type { PlcCommand, PlcPointEditorPoint } from './client';

export type PlcPointEditorCommand = PlcCommand & {
  command: 'robot.point.capture' | 'robot.point.save';
  index: number;
};
export interface PlcPointEditorReply {
  sequence: number;
  index: number;
  command: PlcPointEditorCommand['command'];
  point: Omit<PlcPointEditorPoint, 'index' | 'pointId'>;
}
type PendingPoint = {
  command: PlcPointEditorCommand;
  resolve: (reply: PlcPointEditorReply) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// Telemetry AckSeq and individual XYZ notifications never complete a request.
// Only the gateway reply with this requestId can replace the editor draft.
export class PointEditorRequests {
  private pending = new Map<string, PendingPoint>();
  private timeoutMs: number;
  constructor(timeoutMs = 10_000) { this.timeoutMs = timeoutMs; }

  run(requestId: string, command: PlcPointEditorCommand, send: () => void): Promise<PlcPointEditorReply> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Нет подтверждённого результата PLC. Черновик сохранён; проверьте состояние перед повтором.'));
      }, this.timeoutMs);
      this.pending.set(requestId, { command, resolve, reject, timer });
      try { send(); }
      catch (error) {
        this.pending.delete(requestId);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  receive(message: { requestId?: string; ok?: boolean; error?: string; pointEditor?: unknown }): boolean {
    const requestId = message.requestId ?? '';
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    if (message.ok !== true) {
      pending.reject(new Error(message.error || 'PLC отклонил команду редактора'));
      return true;
    }
    const reply = message.pointEditor as PlcPointEditorReply | undefined;
    if (!reply || reply.index !== pending.command.index || reply.command !== pending.command.command
      || !Number.isInteger(reply.sequence) || reply.sequence < 1 || reply.sequence > 0xffffffff
      || !reply.point || typeof reply.point.configured !== 'boolean'
      || ![reply.point.x, reply.point.y, reply.point.z, reply.point.magazineSafeZ,
        reply.point.magazineChangeZ, reply.point.speedFactor].every(value => typeof value === 'number' && Number.isFinite(value))) {
      pending.reject(new Error('Шлюз не вернул согласованный результат этой команды. Черновик сохранён.'));
      return true;
    }
    pending.resolve({ ...reply, point: { ...reply.point } });
    return true;
  }

  reset(reason: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
