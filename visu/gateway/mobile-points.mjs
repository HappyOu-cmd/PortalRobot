import { randomBytes } from 'node:crypto';
import { AuthStoreError } from './auth-store.mjs';

export const MOBILE_COOKIE = 'portal_mobile_points';
export const isPhoneAgent = (agent = '') => /Android|iPhone|iPad|iPod|Mobile/i.test(agent);
export const MOBILE_ACTIONS = Object.freeze([
  'capture', 'save', 'check', 'prepareCheck', 'holdCheck', 'stop',
  'robot', 'motionHeartbeat', 'motionStop',
]);
export const MOBILE_ROBOT_COMMANDS = Object.freeze([
  'robot.axis.jog', 'robot.axis.moveRelative', 'robot.continuousMode', 'robot.manualStep',
  'robot.speedOverride', 'robot.enableDrives', 'robot.disableDrives', 'robot.stop', 'robot.reset',
]);
const fail = (message, status = 403) => { throw new AuthStoreError(message, status, 'MOBILE_POINTS'); };
const publicIdentity = (user) => user && ({ id: user.id, username: user.username, displayName: user.displayName, role: user.role });
const clampPercent = (value, fallback = 0.1) => {
  const numeric = Number(value);
  return Math.max(0.1, Math.min(100, Number.isFinite(numeric) ? numeric : fallback));
};
const sameJog = (left, right) => left?.axis === right?.axis && left?.direction === right?.direction;

// Companion credentials never enter auth_session and cannot authorize any
// ordinary REST/WebSocket command, even when the account is an administrator.
export class MobilePointsService {
  constructor({ authenticate, primary, snapshot, execute, heartbeat, stop, stopRobot = stop,
    motionHeartbeat = async () => {}, motionActive = async () => {}, audit = () => {}, now = Date.now }) {
    Object.assign(this, { authenticate, primary, snapshot, execute, heartbeat, stop, stopRobot,
      motionHeartbeat, motionActive, audit, now });
    this.sessions = new Map();
    this.owner = null;
    this.busy = false;
  }
  login(username, password) {
    const user = this.authenticate(username, password);
    const primary = this.primary();
    if (!primary || primary.user.id !== user.id) fail('Войдите под аккаунтом, который сейчас открыт на ячейке');
    this.prune();
    if (this.sessions.size >= 8) fail('Достигнут предел мобильных сессий', 429);
    const token = randomBytes(32).toString('base64url');
    const session = { user: publicIdentity(user), parent: primary.token,
      expiresAt: Math.min(primary.expiresAt, this.now() + 12 * 3600_000), lastSeen: this.now(),
      cancelledMotionLeases: new Set() };
    this.sessions.set(token, session);
    this.audit('auth-login', 'accepted', 'Вход в мобильный редактор точек', session.user);
    return { token, ...this.sessionView(session) };
  }
  sessionView(session) {
    return { authenticated: Boolean(session), user: session?.user ?? null, expiresAt: session?.expiresAt,
      cellUser: publicIdentity(this.primary()?.user) ?? null };
  }
  getSession(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    const primary = this.primary();
    if (session.expiresAt <= this.now() || !primary || primary.token !== session.parent || primary.user.id !== session.user.id) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }
  require(token) {
    const session = this.getSession(token);
    if (!session) fail('Сессия редактора завершена. Проверьте вход на ячейке', 401);
    session.lastSeen = this.now();
    return session;
  }
  prune() { for (const token of this.sessions.keys()) this.getSession(token); }
  motionLeaseId(body) {
    const leaseId = String(body.leaseId ?? '');
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(leaseId)) fail('Неверная мобильная аренда движения', 400);
    return leaseId;
  }
  cancelMotionLease(session, leaseId) {
    session.cancelledMotionLeases ??= new Set();
    session.cancelledMotionLeases.add(leaseId);
    while (session.cancelledMotionLeases.size > 32) {
      session.cancelledMotionLeases.delete(session.cancelledMotionLeases.values().next().value);
    }
  }
  async releaseMotionOwner(owner) {
    if (this.owner !== owner) return;
    this.owner = null;
    await this.motionActive(false);
  }
  async logout(token) {
    const session = this.sessions.get(token);
    this.sessions.delete(token);
    if (this.owner?.token === token) await this.stopOwned();
    if (session) this.audit('auth-logout', 'completed', 'Выход из мобильного редактора точек', session.user);
  }
  async stopOwned() {
    if (!this.owner) return;
    const owner = this.owner;
    owner.cancelled = true;
    const hold = this.sessions.get(owner.token)?.checkHold;
    if (hold && hold.id === owner.holdId) hold.cancelled = true;
    if (owner.type === 'jog' || owner.type === 'step') {
      try { await this.stopRobot(owner); }
      finally {
        await this.motionActive(false).catch(() => {});
        // Release may overtake the OPC write that starts motion. Keep ownership
        // until startup exits so it can repeat Stop after a possible late TRUE.
        if (!owner.pending && this.owner === owner) this.owner = null;
      }
      return;
    }
    // Stop bypasses the editor transaction lock; watchdog is the fallback if OPC is lost.
    await this.stop();
  }
  async state(token, visible = true) {
    this.require(token);
    if (!visible && this.owner?.token === token) await this.stopOwned();
    const state = this.snapshot();
    // Reading telemetry is NOT evidence that the operator is holding the control.
    // Only holdCheck renews an active check's lease and PLC watchdog.
    return {
      ...state,
      owned: this.owner?.token === token,
      activeJog: this.owner?.token === token && this.owner.type === 'jog' ? this.owner.activeJog : null,
    };
  }
  phoneSpeedLimitPercent() {
    return clampPercent(this.snapshot().phoneSpeedLimitPercent, 10);
  }
  async ensurePhoneSpeedLimit() {
    const state = this.snapshot();
    const limit = clampPercent(state.phoneSpeedLimitPercent, 10);
    const current = clampPercent(state.robot?.speedOverridePercent, 0.1);
    if (current > limit + 0.05) await this.execute({ command: 'robot.speedOverride', value: limit });
    return limit;
  }
  async robotAction(token, session, body) {
    const command = String(body.command ?? '');
    if (!MOBILE_ROBOT_COMMANDS.includes(command)) fail('С телефона разрешён только мобильный пульт JOG');
    const requestId = randomBytes(12).toString('hex');
    // Stop is never serialized behind a pending OPC command.
    if (command === 'robot.stop') {
      if (this.owner?.token === token) await this.stopOwned();
      else await this.execute({ command, requestId });
      this.audit('operator-command', 'completed', 'Мобильный пульт: остановка робота', session.user, { requestId });
      return { ok: true };
    }
    if (this.busy) fail('Предыдущая операция ещё не завершена', 409);
    if (this.owner && this.owner.token !== token) fail('Роботом уже управляет другая мобильная сессия', 409);

    const active = command === 'robot.axis.jog' && Boolean(body.value);
    const axis = Math.round(Number(body.machine));
    const direction = body.direction === 'negative' || body.direction === 'positive' ? body.direction : null;
    if (command === 'robot.axis.jog'
      && (!Number.isInteger(axis) || axis < 1 || axis > 3 || !direction)) fail('Неверная команда JOG оси', 400);

    this.busy = true;
    try {
      if (command === 'robot.axis.jog') {
        if (!active) {
          if (!this.owner) return { ok: true, released: true };
          if (this.owner.type !== 'jog' || !sameJog(this.owner.activeJog, { axis, direction })) return { ok: true, released: true };
          await this.stopOwned();
          return { ok: true, released: true };
        }

        if (this.owner?.type === 'check') fail('Сначала завершите проверку точки', 409);
        const leaseId = this.motionLeaseId(body);
        if (session.cancelledMotionLeases?.has(leaseId)) fail('Мобильная аренда уже остановлена', 409);
        const previousOwner = this.owner;
        if (previousOwner?.type === 'jog' && previousOwner.activeJog && !sameJog(previousOwner.activeJog, { axis, direction })) {
          await this.stopOwned();
        }
        if (this.owner) fail('Сначала завершите текущее мобильное движение', 409);
        const owner = { type: 'jog', token, user: session.user, requestId, leaseId,
          cancelled: false, pending: true, activeJog: null, lastHeld: this.now(), startedAt: this.now() };
        owner.activeJog = { axis, direction };
        this.owner = owner;
        try {
          const limit = await this.ensurePhoneSpeedLimit();
          await this.motionHeartbeat();
          await this.motionActive(true);
          if (owner.cancelled || session.cancelledMotionLeases?.has(leaseId)) fail('Запуск JOG отменён', 409);
          await this.execute({ command, requestId, machine: axis, direction, value: true });
          owner.pending = false;
          if (owner.cancelled || session.cancelledMotionLeases?.has(leaseId)) {
            await this.stopOwned();
            fail('Запуск JOG отменён', 409);
          }
          this.audit('operator-command', 'accepted', `Мобильный пульт: JOG ${axis} ${direction}`, session.user, { requestId, axis, direction, phoneSpeedLimitPercent: limit });
          return { ok: true, leaseId, phoneSpeedLimitPercent: limit };
        } catch (error) {
          owner.pending = false;
          if (this.owner === owner) await this.stopOwned().catch(() => {});
          throw error;
        }
      }

      if (this.owner?.type === 'jog' && ['robot.continuousMode', 'robot.manualStep', 'robot.enableDrives', 'robot.disableDrives', 'robot.reset', 'robot.axis.moveRelative'].includes(command)) {
        await this.stopOwned();
      }

      let value = body.value;
      let phoneSpeedLimitPercent;
      if (command === 'robot.speedOverride') {
        phoneSpeedLimitPercent = this.phoneSpeedLimitPercent();
        value = Math.min(clampPercent(value), phoneSpeedLimitPercent);
      } else if (command === 'robot.axis.moveRelative') {
        const leaseId = this.motionLeaseId(body);
        if (this.owner) fail('Сначала завершите текущее мобильное движение', 409);
        if (session.cancelledMotionLeases?.has(leaseId)) fail('Мобильная аренда уже остановлена', 409);
        const stepOwner = { type: 'step', token, user: session.user, requestId, leaseId,
          axis: Math.round(Number(body.machine)), cancelled: false, pending: true, seenBusy: false, startedAt: this.now() };
        this.owner = stepOwner;
        try {
          phoneSpeedLimitPercent = await this.ensurePhoneSpeedLimit();
          await this.motionHeartbeat();
          await this.motionActive(true);
          if (stepOwner.cancelled || session.cancelledMotionLeases?.has(leaseId)) fail('Шаговое движение отменено', 409);
          await this.execute({ command, requestId, machine: body.machine, value });
          stepOwner.pending = false;
          if (stepOwner.cancelled || session.cancelledMotionLeases?.has(leaseId)) {
            await this.stopOwned();
            fail('Шаговое движение отменено', 409);
          }
          this.audit('operator-command', 'accepted', `Мобильный пульт: ${command}`, session.user, {
            requestId, phoneSpeedLimitPercent, appliedValue: value, leaseId,
          });
          return { ok: true, leaseId, phoneSpeedLimitPercent, appliedValue: value };
        } catch (error) {
          stepOwner.cancelled = true;
          stepOwner.pending = false;
          if (this.owner === stepOwner) await this.stopOwned().catch(() => {});
          throw error;
        }
      }
      await this.execute({ command, requestId, machine: body.machine, value });
      this.audit('operator-command', 'accepted', `Мобильный пульт: ${command}`, session.user, {
        requestId, ...(phoneSpeedLimitPercent === undefined ? {} : { phoneSpeedLimitPercent, appliedValue: value }),
      });
      return { ok: true, ...(phoneSpeedLimitPercent === undefined ? {} : { phoneSpeedLimitPercent, appliedValue: value }) };
    } catch (error) {
      this.audit('operator-command', 'rejected', `Мобильный пульт: ${error.message}`, session.user, { requestId, command });
      throw error;
    } finally { this.busy = false; }
  }
  async action(token, body) {
    const session = this.require(token);
    if (!MOBILE_ACTIONS.includes(body.action)) fail('С телефона доступны только мобильный пульт и редактор точек');
    if (body.action === 'motionHeartbeat') {
      const leaseId = this.motionLeaseId(body);
      const owner = this.owner;
      if (!owner || owner.type !== 'jog' || owner.token !== token || owner.leaseId !== leaseId
        || owner.cancelled || session.cancelledMotionLeases?.has(leaseId)) fail('Аренда JOG завершена', 409);
      if (this.now() - owner.lastHeld > 1500) {
        await this.stopOwned().catch(() => {});
        fail('Потеряно подтверждение удержания JOG', 409);
      }
      owner.lastHeld = this.now();
      await this.motionHeartbeat();
      return { ok: true };
    }
    if (body.action === 'motionStop') {
      const leaseId = this.motionLeaseId(body);
      this.cancelMotionLease(session, leaseId);
      if (this.owner?.token === token && this.owner.leaseId === leaseId) await this.stopOwned();
      return { ok: true };
    }
    if (body.action === 'robot') return this.robotAction(token, session, body);
    if (body.action === 'prepareCheck') {
      if (this.busy || this.owner) fail('Предыдущая операция ещё не завершена', 409);
      session.checkHold = { id: randomBytes(18).toString('hex'), cancelled: false, used: false, lastHeld: this.now() };
      return { ok: true, holdId: session.checkHold.id };
    }
    if (body.action === 'holdCheck') {
      const hold = session.checkHold;
      if (!hold || hold.id !== body.holdId || hold.cancelled) fail('Удержание завершено. Отпустите кнопку и нажмите снова', 409);
      // A delayed packet must never revive a lease whose deadline already passed.
      if (this.now() - hold.lastHeld > 1500) {
        hold.cancelled = true;
        if (this.owner?.token === token && this.owner.holdId === hold.id) await this.stopOwned();
        fail('Потеряно подтверждение удержания', 409);
      }
      hold.lastHeld = this.now();
      if (this.owner?.token === token && this.owner.holdId === hold.id && !this.owner.cancelled) {
        await this.heartbeat();
      }
      return { ok: true };
    }
    if (body.action === 'stop') {
      // A release may overtake its start HTTP request. Cancel the prepared id
      // before checking ownership, so that late start cannot move the robot.
      if (body.holdId) {
        if (session.checkHold?.id === body.holdId) session.checkHold.cancelled = true;
        if (this.owner?.token !== token || this.owner.holdId !== body.holdId) return { ok: true };
      } else if (!this.owner) return { ok: true };
      if (this.owner?.token !== token) fail('Эта проверка запущена в другой сессии');
      if (session.checkHold && session.checkHold.id === this.owner.holdId) session.checkHold.cancelled = true;
      await this.stopOwned();
      return { ok: true };
    }
    if (this.busy || this.owner) fail('Предыдущая операция ещё не завершена', 409);
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 1 || index > 12) fail('Неверный индекс точки', 400);
    const hold = body.action === 'check' ? session.checkHold : null;
    if (body.action === 'check') {
      if (!hold || hold.id !== body.holdId || hold.cancelled || hold.used || this.now() - hold.lastHeld > 1500) {
        fail('Для проверки точки необходимо новое удержание кнопки', 409);
      }
      hold.used = true;
    }
    this.busy = true;
    const command = `robot.point.${body.action}`;
    const requestId = randomBytes(12).toString('hex');
    const owner = body.action === 'check' ? { type: 'check', token, user: session.user, requestId, holdId: hold.id, cancelled: false, pending: true, sequence: 0 } : null;
    if (owner) this.owner = owner;
    const message = { command, requestId, index, draft: body.draft, speedFactor: body.speedFactor,
      _assertAuthorized: () => {
        this.require(token);
        if (owner && (owner.cancelled || hold.cancelled || this.now() - hold.lastHeld > 1500)) fail('Запуск проверки отменён', 409);
      } };
    try {
      if (owner) await this.heartbeat();
      message._assertAuthorized();
      this.audit('operator-command', 'requested', `Мобильный редактор: ${body.action}, точка ${index}`, session.user, { requestId, index });
      await this.execute(message);
      if (owner) { owner.sequence = message._pointEditorSequence; owner.pending = false; }
      // Stop can be consumed by PLC before a concurrently written CommandSeq.
      // Repeat it after acknowledgement; tick also retries until terminal state.
      if (owner && (owner.cancelled || hold.cancelled || !this.getSession(token) || this.now() - hold.lastHeld > 1500)) await this.stopOwned();
      this.audit('operator-command', 'completed', `Мобильный редактор: PLC принял ${body.action}, точка ${index}`, session.user, { requestId, commandSeq: message._pointEditorSequence });
      return { ok: true, sequence: message._pointEditorSequence, point: message._pointEditorResult };
    } catch (error) {
      if (owner) {
        owner.cancelled = true;
        owner.pending = false;
        owner.sequence = message._pointEditorSequence || 0;
        await this.stop().catch(() => {});
        // Retain ownership while a late PLC response is possible.
        owner.failedAt = this.now();
      }
      this.audit('operator-command', 'rejected', `Мобильный редактор: ${error.message}`, session.user, { requestId, index });
      throw error;
    } finally { this.busy = false; }
  }
  async tick() {
    this.prune();
    const owner = this.owner;
    if (!owner) return;
    const session = this.getSession(owner.token);
    const hold = owner.type === 'check' ? session?.checkHold : null;
    const expired = !session || this.now() - session.lastSeen > 1500
      || (owner.type === 'check' && (!hold || hold.id !== owner.holdId || hold.cancelled || this.now() - hold.lastHeld > 1500))
      || (owner.type === 'jog' && this.now() - owner.lastHeld > 1500);
    if (expired || owner.cancelled) await this.stopOwned().catch(() => {});
    if (this.owner !== owner) return;
    if (owner.type === 'jog') return;
    if (owner.type === 'step') {
      await this.motionHeartbeat().catch(() => {});
      const axis = this.snapshot().axes?.[owner.axis - 1];
      if (axis?.busy) owner.seenBusy = true;
      if (!owner.pending && !axis?.busy && owner.seenBusy) {
        await this.releaseMotionOwner(owner).catch(() => {});
      } else if (!owner.pending && !axis?.busy && this.now() - owner.startedAt > 2000) {
        // No busy edge usually means the PLC rejected the step. Use Stop instead
        // of merely dropping the lease so a delayed start cannot escape it.
        await this.stopOwned().catch(() => {});
      }
      return;
    }
    const state = this.snapshot();
    if (!owner.pending && !state.active && ((owner.sequence && state.runSeq === owner.sequence && [2, 3, 4].includes(state.checkState))
      || (owner.failedAt && this.now() - owner.failedAt > 6000))) {
      this.audit('operator-command', state.checkState === 2 ? 'completed' : 'stopped',
        `Проверка точки: ${state.checkState === 2 ? 'завершена' : 'остановлена или отклонена'}`, owner.user,
        { requestId: owner.requestId, commandSeq: owner.sequence, plcState: state.checkState });
      if (hold && hold.id === owner.holdId) hold.cancelled = true;
      if (this.owner === owner) this.owner = null;
    }
  }
}
