from __future__ import annotations

import math
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any

from .constants import (
    ALARM_TEXT,
    GRIPPER_1_CLOSED,
    GRIPPER_1_OPEN,
    GRIPPER_2_CLOSED,
    GRIPPER_2_OPEN,
    GRIPPER_COMMANDS,
    MAGAZINE_COMMANDS,
    MOVEMENT_COMMANDS,
    POINT_NAMES,
    PROTOCOL_VERSION,
    ROTATED_TO_BLANK,
    ROTATED_TO_DETAIL,
    ROTATION_COMMANDS,
    STATUS_AUTOMATIC_MODE,
    STATUS_CONTROLLER_ON,
    STATUS_DRIVES_ENABLED,
    STATUS_EMERGENCY_STOP,
    STATUS_HOMED,
    STATUS_POSITION_VALID,
    STATUS_REMOTE_ENABLED,
    STATUS_ROBOT_ALARM,
    STATUS_ROBOT_READY,
    STATUS_SIMULATOR_ACTIVE,
    AlarmCode,
    CommandCode,
    ExecutionState,
    FAST_TIME_SCALE,
    OperationPhase,
    ResultCode,
    RobotMode,
)


@dataclass
class MotionState:
    start: tuple[float, float, float]
    target: tuple[float, float, float]
    direction: tuple[float, float, float]
    total_distance: float
    distance: float = 0.0
    velocity: float = 0.0
    acceleration: float = 0.0
    max_velocity: float = 0.0
    elapsed: float = 0.0


@dataclass
class TimedAction:
    command: int
    duration: float
    elapsed: float = 0.0


class RobotModel:
    """Thread-safe executable model of the external robot controller."""

    # The PLC polls feedback every 50 ms and FB_ROBOT must observe BUSY before
    # DONE. Fast simulation still keeps at least three nominal polls visible.
    MIN_BUSY_VISIBILITY_S = 0.15

    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self._lock = threading.RLock()
        self._runtime_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._last_tick = time.monotonic()
        self._last_robot_heartbeat_tick = self._last_tick
        self._last_plc_heartbeat_tick = self._last_tick

        self.mode = RobotMode.STOPPED
        self.execution_state = ExecutionState.IDLE
        self.result_code = ResultCode.OK
        self.operation_phase = OperationPhase.IDLE
        self.ack_seq = 0
        self.last_accepted_seq = 0
        self.active_command = 0
        self.current_point = 0
        self.position = [0.0, 0.0, 0.0]
        self.gripper_status = (
            GRIPPER_1_OPEN | GRIPPER_2_OPEN | ROTATED_TO_BLANK
        )
        self.robot_heartbeat = 0
        self.command_registers = [0] * 9

        self._motion: MotionState | None = None
        self._timed_action: TimedAction | None = None
        self._command_source = ""
        self._local_terminal_until = 0.0
        self._stop_requested = False
        self._stop_after_action = False
        self._pending_stop_alarm = AlarmCode.NONE
        self._pending_result = ResultCode.STOPPED
        self._plc_heartbeat_seen = False
        self._last_plc_heartbeat = 0
        self._plc_heartbeat_lost = False
        self.force_plc_heartbeat_loss = False
        self.freeze_robot_heartbeat = False
        self._time_scale = 1.0

        self.fault_sources: dict[str, bool] = {
            "emergency_stop": False,
            "motion_fault": False,
            "gripper_1_fault": False,
            "gripper_2_fault": False,
            "safety_interlock": False,
            "homing_lost": False,
            "drives_disabled": False,
        }
        self.latched_alarm = AlarmCode.NONE
        self.events: deque[str] = deque(maxlen=300)
        self._log("Симулятор инициализирован в режиме «Остановлен»")

    def start_runtime(self) -> None:
        with self._lock:
            if self._runtime_thread and self._runtime_thread.is_alive():
                return
            self._stop_event.clear()
            self._last_tick = time.monotonic()
            self._runtime_thread = threading.Thread(
                target=self._runtime_loop,
                name="robot-model",
                daemon=True,
            )
            self._runtime_thread.start()

    def stop_runtime(self) -> None:
        self._stop_event.set()
        thread = self._runtime_thread
        if thread and thread.is_alive():
            thread.join(timeout=2.0)

    def _runtime_loop(self) -> None:
        period = max(0.005, float(self.config["server"]["simulation_period_s"]))
        while not self._stop_event.wait(period):
            now = time.monotonic()
            with self._lock:
                dt = min(max(now - self._last_tick, 0.0), 0.2)
                self._last_tick = now
                self.tick(dt, now)

    def tick(self, dt: float, now: float | None = None) -> None:
        """Advance the controller model. Tests may call this method directly."""
        with self._lock:
            now = time.monotonic() if now is None else now
            self._update_robot_heartbeat(now)
            self._check_plc_heartbeat(now)
            self._process_control_registers(now)

            if self._motion is not None:
                self._tick_motion(dt)
            elif self._timed_action is not None:
                self._tick_timed_action(dt)

            if (
                self._command_source == "local"
                and self.execution_state in {ExecutionState.DONE, ExecutionState.ERROR}
                and now >= self._local_terminal_until
                and self.latched_alarm == AlarmCode.NONE
            ):
                self._return_idle()

    def _update_robot_heartbeat(self, now: float) -> None:
        period = max(0.02, float(self.config["server"]["robot_heartbeat_period_s"]))
        if not self.freeze_robot_heartbeat and now - self._last_robot_heartbeat_tick >= period:
            increments = max(1, int((now - self._last_robot_heartbeat_tick) / period))
            self.robot_heartbeat = (self.robot_heartbeat + increments) & 0xFFFF
            self._last_robot_heartbeat_tick += increments * period

    def _check_plc_heartbeat(self, now: float) -> None:
        if self.force_plc_heartbeat_loss and not self._plc_heartbeat_lost:
            self._plc_heartbeat_lost = True
            self._request_fault_stop(AlarmCode.PLC_HEARTBEAT_LOST, ResultCode.STOPPED)
            self._log("Принудительно потерян heartbeat PLC")
            return
        if not self._plc_heartbeat_seen or self._plc_heartbeat_lost:
            return
        timeout = max(0.5, float(self.config["server"]["plc_heartbeat_timeout_s"]))
        if now - self._last_plc_heartbeat_tick > timeout:
            self._plc_heartbeat_lost = True
            self._request_fault_stop(AlarmCode.PLC_HEARTBEAT_LOST, ResultCode.STOPPED)
            self._log("Авария: heartbeat PLC перестал изменяться")

    def accept_command_registers(self, values: list[int], now: float | None = None) -> None:
        if len(values) != 9:
            raise ValueError("Command block must contain exactly 9 registers")
        now = time.monotonic() if now is None else now
        with self._lock:
            self.command_registers = [int(value) & 0xFFFF for value in values]
            heartbeat = self.command_registers[8]
            if heartbeat != self._last_plc_heartbeat and not self.force_plc_heartbeat_loss:
                self._last_plc_heartbeat = heartbeat
                self._last_plc_heartbeat_tick = now
                self._plc_heartbeat_seen = True
                if self._plc_heartbeat_lost:
                    self._plc_heartbeat_lost = False
                    self._log("Heartbeat PLC восстановлен; требуется Reset")
            self._process_control_registers(now)

    def _process_control_registers(self, now: float) -> None:
        command, execute, stop, reset, slot, magazine_id, _, sequence, _ = self.command_registers

        if stop:
            self._handle_stop()

        if reset:
            self.reset_alarm()

        if (
            not stop
            and not reset
            and execute
            and sequence != 0
            and sequence != self.last_accepted_seq
            and self.execution_state == ExecutionState.IDLE
        ):
            self._accept_external_command(command, slot, magazine_id, sequence)

        if (
            not execute
            and self._command_source == "external"
            and self.execution_state
            in {ExecutionState.DONE, ExecutionState.ERROR, ExecutionState.STOPPED}
        ):
            self._return_idle()

    def _accept_external_command(self, command: int, slot: int, magazine_id: int, sequence: int) -> None:
        self.last_accepted_seq = sequence
        self.ack_seq = sequence
        self.active_command = command
        self.result_code = ResultCode.OK
        self.operation_phase = OperationPhase.VALIDATING
        self.execution_state = ExecutionState.ACCEPTED
        self._command_source = "external"
        self._log(
            f"Принята команда {command}, CommandSeq={sequence}, "
            f"MagazineId={magazine_id}, ActiveSlot={slot}"
        )

        if not self.is_ready:
            self._finish_error(ResultCode.NOT_READY, latch_alarm=False)
            return
        self._start_command(command, slot, magazine_id)

    def _start_command(self, command: int, slot: int, magazine_id: int = 1) -> None:
        if command == int(CommandCode.RESERVED) or command not in (
            MOVEMENT_COMMANDS | GRIPPER_COMMANDS | ROTATION_COMMANDS
        ):
            self._finish_error(ResultCode.UNSUPPORTED_COMMAND, latch_alarm=False)
            return

        if command in MOVEMENT_COMMANDS:
            target = self.resolve_point(command, slot, magazine_id)
            if target is None:
                code = ResultCode.INVALID_SLOT if command in MAGAZINE_COMMANDS else ResultCode.INVALID_POINT
                self._finish_error(code, latch_alarm=False)
                return
            self._begin_motion(command, target)
            return

        duration = self._action_duration(command)
        self._timed_action = TimedAction(command=command, duration=duration)
        self.execution_state = ExecutionState.BUSY
        self.operation_phase = (
            OperationPhase.GRIPPER if command in GRIPPER_COMMANDS else OperationPhase.ROTATING
        )

    def resolve_point(
        self, command: int, slot: int, magazine_id: int = 1
    ) -> tuple[float, float, float, float] | None:
        if command in MAGAZINE_COMMANDS:
            if magazine_id not in {1, 2}:
                return None
            magazine = self.config["magazine" if magazine_id == 1 else "magazine_2"]
            rows = int(magazine["rows"])
            columns = int(magazine["columns"])
            if rows <= 0 or columns <= 0 or slot < 1 or slot > rows * columns:
                return None
            index = slot - 1
            column = index % columns
            row = index // columns
            x = float(magazine["base_x"]) + column * float(magazine["pitch_x"])
            y = float(magazine["base_y"]) + row * float(magazine["pitch_y"])
            z = {
                int(CommandCode.MAGAZINE_SAFE): float(magazine["safe_z"]),
                int(CommandCode.MAGAZINE_CHANGE): float(magazine["change_z"]),
                int(CommandCode.MAGAZINE_IN_SLOT): float(magazine["base_z"]),
            }[command]
            return x, y, z, float(magazine.get("speed_factor", 1.0))

        point = self.config["points"].get(str(command))
        if not point:
            return None
        return (
            float(point["x"]),
            float(point["y"]),
            float(point["z"]),
            float(point.get("speed_factor", 1.0)),
        )

    def _begin_motion(self, command: int, target_data: tuple[float, float, float, float]) -> None:
        tx, ty, tz, speed_factor = target_data
        start = tuple(self.position)
        delta = (tx - start[0], ty - start[1], tz - start[2])
        distance = math.sqrt(sum(value * value for value in delta))
        if distance <= 1e-6:
            self.position[:] = [tx, ty, tz]
            self.current_point = command
            self._timed_action = TimedAction(
                command=command,
                duration=self.MIN_BUSY_VISIBILITY_S,
            )
            self.execution_state = ExecutionState.BUSY
            self.operation_phase = OperationPhase.MOVING
            return
        direction = tuple(value / distance for value in delta)
        max_velocity = max(
            0.1,
            float(self.config["motion"]["speed_mm_s"])
            * max(0.01, speed_factor)
            * self._time_scale,
        )
        self._motion = MotionState(
            start=start,
            target=(tx, ty, tz),
            direction=direction,
            total_distance=distance,
            max_velocity=max_velocity,
        )
        self.execution_state = ExecutionState.BUSY
        self.operation_phase = OperationPhase.ACCELERATING

    def _tick_motion(self, dt: float) -> None:
        motion = self._motion
        if motion is None or dt <= 0.0:
            return
        motion.elapsed += max(0.0, dt)
        params = self.config["motion"]
        acceleration_limit = max(0.1, float(params["acceleration_mm_s2"]) * self._time_scale**2)
        deceleration_limit = max(0.1, float(params["deceleration_mm_s2"]) * self._time_scale**2)
        jerk = max(0.1, float(params["jerk_mm_s3"]) * self._time_scale**3)
        remaining = max(0.0, motion.total_distance - motion.distance)

        if not self._stop_requested and remaining <= 0.01:
            motion.distance = motion.total_distance
            self.position[:] = list(motion.target)
            self.current_point = self.active_command
            if motion.elapsed < self.MIN_BUSY_VISIBILITY_S:
                motion.velocity = 0.0
                motion.acceleration = 0.0
                self.operation_phase = OperationPhase.MOVING
                return
            self._motion = None
            self._finish_done()
            return

        stopping_distance = (
            motion.velocity * motion.velocity / (2.0 * deceleration_limit)
            + abs(motion.acceleration) * max(motion.velocity, 0.0) / jerk
        )
        if self._stop_requested:
            desired_acceleration = -deceleration_limit
            self.operation_phase = OperationPhase.STOPPING
        elif remaining <= stopping_distance + max(0.01, motion.velocity * dt):
            desired_acceleration = -deceleration_limit
            self.operation_phase = OperationPhase.DECELERATING
        elif motion.velocity < motion.max_velocity:
            desired_acceleration = acceleration_limit
            self.operation_phase = OperationPhase.ACCELERATING
        else:
            desired_acceleration = 0.0
            self.operation_phase = OperationPhase.MOVING

        max_acceleration_change = jerk * dt
        acceleration_delta = max(
            -max_acceleration_change,
            min(max_acceleration_change, desired_acceleration - motion.acceleration),
        )
        motion.acceleration += acceleration_delta
        motion.acceleration = max(-deceleration_limit, min(acceleration_limit, motion.acceleration))
        previous_velocity = motion.velocity
        motion.velocity = max(0.0, min(motion.max_velocity, motion.velocity + motion.acceleration * dt))
        travelled = max(0.0, (previous_velocity + motion.velocity) * 0.5 * dt)

        if self._stop_requested and motion.velocity <= 1e-3 and motion.acceleration <= 0.0:
            self._finish_pending_fault()
            return

        if not self._stop_requested and travelled >= remaining:
            motion.distance = motion.total_distance
            self.position[:] = list(motion.target)
            self.current_point = self.active_command
            if motion.elapsed < self.MIN_BUSY_VISIBILITY_S:
                motion.velocity = 0.0
                motion.acceleration = 0.0
                self.operation_phase = OperationPhase.MOVING
                return
            self._motion = None
            self._finish_done()
            return

        motion.distance = min(motion.total_distance, motion.distance + travelled)
        for index in range(3):
            self.position[index] = motion.start[index] + motion.direction[index] * motion.distance

    def _tick_timed_action(self, dt: float) -> None:
        action = self._timed_action
        if action is None:
            return
        action.elapsed += max(0.0, dt)
        if action.elapsed < action.duration:
            return
        self._apply_discrete_action(action.command)
        self._timed_action = None
        if self._stop_after_action:
            self._finish_pending_fault()
        else:
            self._finish_done()

    def _apply_discrete_action(self, command: int) -> None:
        if command == int(CommandCode.GRIPPER_1_OPEN):
            self.gripper_status &= ~GRIPPER_1_CLOSED
            self.gripper_status |= GRIPPER_1_OPEN
        elif command == int(CommandCode.GRIPPER_1_CLOSE):
            self.gripper_status &= ~GRIPPER_1_OPEN
            self.gripper_status |= GRIPPER_1_CLOSED
        elif command == int(CommandCode.GRIPPER_2_OPEN):
            self.gripper_status &= ~GRIPPER_2_CLOSED
            self.gripper_status |= GRIPPER_2_OPEN
        elif command == int(CommandCode.GRIPPER_2_CLOSE):
            self.gripper_status &= ~GRIPPER_2_OPEN
            self.gripper_status |= GRIPPER_2_CLOSED
        elif command == int(CommandCode.ROTATE_TO_BLANK):
            self.gripper_status &= ~ROTATED_TO_DETAIL
            self.gripper_status |= ROTATED_TO_BLANK
        elif command == int(CommandCode.ROTATE_TO_DETAIL):
            self.gripper_status &= ~ROTATED_TO_BLANK
            self.gripper_status |= ROTATED_TO_DETAIL

    def _action_duration(self, command: int) -> float:
        gripper = self.config["gripper"]
        key = {
            int(CommandCode.GRIPPER_1_OPEN): "gripper_1_open_s",
            int(CommandCode.GRIPPER_1_CLOSE): "gripper_1_close_s",
            int(CommandCode.GRIPPER_2_OPEN): "gripper_2_open_s",
            int(CommandCode.GRIPPER_2_CLOSE): "gripper_2_close_s",
        }.get(command)
        if key:
            return max(self.MIN_BUSY_VISIBILITY_S, float(gripper[key]) / self._time_scale)
        return max(self.MIN_BUSY_VISIBILITY_S, float(gripper["rotate_s"]) / self._time_scale)

    def _handle_stop(self) -> None:
        if self._motion is not None and not self._stop_requested:
            self._stop_requested = True
            self._pending_stop_alarm = AlarmCode.EXTERNAL_STOP
            self._pending_result = ResultCode.STOPPED
            self.operation_phase = OperationPhase.STOPPING
            self._log("Stop принят: выполняется контролируемое торможение")
        elif self._timed_action is not None and not self._stop_after_action:
            self._stop_after_action = True
            self._pending_stop_alarm = AlarmCode.EXTERNAL_STOP
            self._pending_result = ResultCode.STOPPED
            self._log("Stop принят: действие захвата завершится перед остановкой")

    def _request_fault_stop(self, alarm: AlarmCode, result: ResultCode) -> None:
        if self._motion is not None:
            self._stop_requested = True
            self._pending_stop_alarm = alarm
            self._pending_result = result
            self.operation_phase = OperationPhase.STOPPING
        elif self._timed_action is not None:
            self._stop_after_action = True
            self._pending_stop_alarm = alarm
            self._pending_result = result
        else:
            self._latch_alarm(alarm)
            self.execution_state = ExecutionState.ERROR
            self.result_code = result
            self.operation_phase = OperationPhase.FAULT

    def _finish_pending_fault(self) -> None:
        alarm = self._pending_stop_alarm or AlarmCode.EXTERNAL_STOP
        result = self._pending_result
        if result == ResultCode.STOPPED:
            self._finish_stopped(alarm)
            return
        self._motion = None
        self._timed_action = None
        self._stop_requested = False
        self._stop_after_action = False
        self._pending_stop_alarm = AlarmCode.NONE
        self._pending_result = ResultCode.STOPPED
        self.execution_state = ExecutionState.ERROR
        self.result_code = result
        self.operation_phase = OperationPhase.FAULT
        self._latch_alarm(alarm)
        self._log(f"Команда {self.active_command} завершена аварией, ResultCode={int(result)}")

    def _finish_done(self) -> None:
        self._motion = None
        self._timed_action = None
        self.execution_state = ExecutionState.DONE
        self.result_code = ResultCode.OK
        self.operation_phase = OperationPhase.IDLE
        self._local_terminal_until = time.monotonic() + 0.35
        self._log(f"Команда {self.active_command} завершена")

    def _finish_error(self, result: ResultCode, latch_alarm: bool) -> None:
        self._motion = None
        self._timed_action = None
        self.execution_state = ExecutionState.ERROR
        self.result_code = result
        self.operation_phase = OperationPhase.FAULT
        if latch_alarm and self.latched_alarm == AlarmCode.NONE:
            self._latch_alarm(AlarmCode.MOTION_FAULT)
        self._local_terminal_until = time.monotonic() + 0.35
        self._log(f"Команда {self.active_command} отклонена, ResultCode={int(result)}")

    def _finish_stopped(self, alarm: AlarmCode) -> None:
        self._motion = None
        self._timed_action = None
        self._stop_requested = False
        self._stop_after_action = False
        self._pending_stop_alarm = AlarmCode.NONE
        self._pending_result = ResultCode.STOPPED
        self.execution_state = ExecutionState.STOPPED
        self.result_code = ResultCode.STOPPED
        self.operation_phase = OperationPhase.FAULT
        self._latch_alarm(alarm)
        self._log(f"Команда {self.active_command} остановлена")

    def _return_idle(self) -> None:
        self.execution_state = ExecutionState.IDLE
        self.result_code = ResultCode.OK
        self.active_command = 0
        self.operation_phase = OperationPhase.IDLE
        self._command_source = ""
        self._stop_requested = False
        self._stop_after_action = False
        self._pending_stop_alarm = AlarmCode.NONE
        self._pending_result = ResultCode.STOPPED

    @property
    def is_ready(self) -> bool:
        return (
            self.mode == RobotMode.AUTOMATIC
            and self.latched_alarm == AlarmCode.NONE
            and not any(self.fault_sources.values())
            and not self._plc_heartbeat_lost
        )

    @property
    def mode_change_allowed(self) -> bool:
        return self.execution_state == ExecutionState.IDLE and self._motion is None and self._timed_action is None

    def set_mode(self, mode: RobotMode) -> bool:
        with self._lock:
            if not self.mode_change_allowed:
                self._log("Смена режима отклонена: команда ещё не освобождена")
                return False
            self.mode = mode
            self._log(f"Установлен режим: {mode.value}")
            return True

    def local_command(self, command: int, slot: int = 0, magazine_id: int = 1) -> bool:
        with self._lock:
            if self.mode != RobotMode.MANUAL or self.execution_state != ExecutionState.IDLE:
                return False
            if self.latched_alarm != AlarmCode.NONE or any(self.fault_sources.values()):
                return False
            self.active_command = command
            self.result_code = ResultCode.OK
            self.execution_state = ExecutionState.ACCEPTED
            self.operation_phase = OperationPhase.VALIDATING
            self._command_source = "local"
            self._start_command(command, slot, magazine_id)
            self._log(f"Локальная команда пульта: {command}, MagazineId={magazine_id}, ActiveSlot={slot}")
            return True

    def local_move_xyz(self, x: float, y: float, z: float) -> bool:
        with self._lock:
            if self.mode != RobotMode.MANUAL or self.execution_state != ExecutionState.IDLE:
                return False
            self.active_command = 0
            self._command_source = "local"
            self.execution_state = ExecutionState.ACCEPTED
            self.operation_phase = OperationPhase.VALIDATING
            self._begin_motion(0, (float(x), float(y), float(z), 0.2))
            self._log(f"Локальное перемещение XYZ: {x:.1f}, {y:.1f}, {z:.1f}")
            return True

    def set_fault_source(self, source: str, active: bool) -> None:
        alarm_map = {
            "emergency_stop": AlarmCode.EMERGENCY_STOP,
            "motion_fault": AlarmCode.MOTION_FAULT,
            "gripper_1_fault": AlarmCode.GRIPPER_1_FAULT,
            "gripper_2_fault": AlarmCode.GRIPPER_2_FAULT,
            "safety_interlock": AlarmCode.SAFETY_INTERLOCK,
            "homing_lost": AlarmCode.HOMING_LOST,
            "drives_disabled": AlarmCode.DRIVES_DISABLED,
        }
        result_map = {
            "emergency_stop": ResultCode.SAFETY_INTERLOCK,
            "motion_fault": ResultCode.MOTION_ERROR,
            "gripper_1_fault": ResultCode.GRIPPER_ERROR,
            "gripper_2_fault": ResultCode.GRIPPER_ERROR,
            "safety_interlock": ResultCode.SAFETY_INTERLOCK,
            "homing_lost": ResultCode.SAFETY_INTERLOCK,
            "drives_disabled": ResultCode.SAFETY_INTERLOCK,
        }
        if source not in alarm_map:
            raise KeyError(source)
        with self._lock:
            self.fault_sources[source] = bool(active)
            if active:
                alarm = alarm_map[source]
                if source == "emergency_stop":
                    self._motion = None
                    self._timed_action = None
                    self._latch_alarm(alarm)
                    self.execution_state = ExecutionState.ERROR
                    self.operation_phase = OperationPhase.FAULT
                else:
                    self._request_fault_stop(alarm, result_map[source])
                self._log(f"Инъекция включена: {source}")
            else:
                self._log(f"Физическая причина устранена: {source}; требуется Reset")

    def set_plc_heartbeat_loss(self, active: bool) -> None:
        with self._lock:
            self.force_plc_heartbeat_loss = bool(active)
            if active:
                self._check_plc_heartbeat(time.monotonic())
            else:
                self._log("Инъекция потери heartbeat PLC снята; ожидается новый счётчик")

    def _latch_alarm(self, alarm: AlarmCode) -> None:
        if alarm != AlarmCode.NONE and self.latched_alarm == AlarmCode.NONE:
            self.latched_alarm = alarm

    def reset_alarm(self) -> bool:
        with self._lock:
            _, execute, stop, _, *_ = self.command_registers
            if execute or stop or any(self.fault_sources.values()) or self._plc_heartbeat_lost:
                return False
            if self._motion is not None or self._timed_action is not None:
                return False
            if self.latched_alarm != AlarmCode.NONE or self.execution_state in {
                ExecutionState.ERROR,
                ExecutionState.STOPPED,
            }:
                previous = self.latched_alarm
                self.latched_alarm = AlarmCode.NONE
                self._return_idle()
                self._log(f"Авария сброшена: {int(previous)}")
                return True
            return False

    def _status_word(self) -> int:
        word = STATUS_CONTROLLER_ON | STATUS_POSITION_VALID | STATUS_SIMULATOR_ACTIVE
        if self.mode in {RobotMode.MANUAL, RobotMode.AUTOMATIC} and not self.fault_sources["drives_disabled"]:
            word |= STATUS_DRIVES_ENABLED
        if not self.fault_sources["homing_lost"]:
            word |= STATUS_HOMED
        if self.mode == RobotMode.AUTOMATIC:
            word |= STATUS_AUTOMATIC_MODE | STATUS_REMOTE_ENABLED
        if self.fault_sources["emergency_stop"]:
            word |= STATUS_EMERGENCY_STOP
        if self.latched_alarm != AlarmCode.NONE:
            word |= STATUS_ROBOT_ALARM
        if self.is_ready:
            word |= STATUS_ROBOT_READY
        return word

    @staticmethod
    def _dint_words(value_mm: float) -> tuple[int, int]:
        raw = int(round(value_mm * 10.0)) & 0xFFFFFFFF
        return (raw >> 16) & 0xFFFF, raw & 0xFFFF

    def status_registers(self) -> list[int]:
        with self._lock:
            x_hi, x_lo = self._dint_words(self.position[0])
            y_hi, y_lo = self._dint_words(self.position[1])
            z_hi, z_lo = self._dint_words(self.position[2])
            return [
                self.ack_seq,
                int(self.execution_state),
                int(self.result_code),
                self.active_command,
                self.current_point,
                self.gripper_status,
                self.robot_heartbeat,
                self._status_word(),
                int(self.latched_alarm),
                x_hi,
                x_lo,
                y_hi,
                y_lo,
                z_hi,
                z_lo,
                int(self.operation_phase),
                PROTOCOL_VERSION,
            ]

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "mode": self.mode.value,
                "mode_change_allowed": self.mode_change_allowed,
                "ready": self.is_ready,
                "execution_state": int(self.execution_state),
                "execution_name": self.execution_state.name,
                "result_code": int(self.result_code),
                "operation_phase": int(self.operation_phase),
                "operation_name": self.operation_phase.name,
                "ack_seq": self.ack_seq,
                "active_command": self.active_command,
                "active_command_name": POINT_NAMES.get(self.active_command, CommandCode(self.active_command).name if self.active_command in {item.value for item in CommandCode} else "UNKNOWN"),
                "current_point": self.current_point,
                "position": tuple(self.position),
                "gripper_status": self.gripper_status,
                "robot_heartbeat": self.robot_heartbeat,
                "plc_heartbeat": self._last_plc_heartbeat,
                "plc_heartbeat_seen": self._plc_heartbeat_seen,
                "plc_heartbeat_lost": self._plc_heartbeat_lost,
                "status_word": self._status_word(),
                "alarm_code": int(self.latched_alarm),
                "alarm_text": ALARM_TEXT.get(self.latched_alarm, "Неизвестная авария"),
                "fault_sources": dict(self.fault_sources),
                "freeze_robot_heartbeat": self.freeze_robot_heartbeat,
                "force_plc_heartbeat_loss": self.force_plc_heartbeat_loss,
                "time_scale": self._time_scale,
                "command_registers": list(self.command_registers),
                "status_registers": self.status_registers(),
                "events": list(self.events),
            }

    def update_config(self, config: dict[str, Any]) -> None:
        with self._lock:
            self.config = config
            self._log("Конфигурация симулятора сохранена")

    def set_fast_mode(self, active: bool, factor: float = FAST_TIME_SCALE) -> None:
        """Accelerate simulated time while retaining every protocol transition."""
        with self._lock:
            self._time_scale = max(1.0, min(FAST_TIME_SCALE, float(factor))) if active else 1.0
            self._log(f"Профиль скорости симуляции: x{self._time_scale:g}")

    def _log(self, message: str) -> None:
        stamp = time.strftime("%H:%M:%S")
        self.events.appendleft(f"{stamp}  {message}")
