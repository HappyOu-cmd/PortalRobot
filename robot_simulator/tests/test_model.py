from __future__ import annotations

import copy

import pytest

from robot_simulator.config import DEFAULT_CONFIG
from robot_simulator.constants import (
    GRIPPER_1_CLOSED,
    GRIPPER_1_OPEN,
    STATUS_SIMULATOR_ACTIVE,
    AlarmCode,
    CommandCode,
    ExecutionState,
    ResultCode,
    RobotMode,
)
from robot_simulator.model import RobotModel


def build_model() -> RobotModel:
    config = copy.deepcopy(DEFAULT_CONFIG)
    config["motion"].update(
        speed_mm_s=5000.0,
        acceleration_mm_s2=10000.0,
        deceleration_mm_s2=10000.0,
        jerk_mm_s3=100000.0,
    )
    config["gripper"].update(
        gripper_1_open_s=0.1,
        gripper_1_close_s=0.1,
        gripper_2_open_s=0.1,
        gripper_2_close_s=0.1,
        rotate_s=0.1,
    )
    config["server"]["plc_heartbeat_timeout_s"] = 1_000_000.0
    model = RobotModel(config)
    assert model.set_mode(RobotMode.AUTOMATIC)
    return model


def test_status_word_identifies_python_simulator() -> None:
    model = build_model()
    assert model.status_registers()[7] & STATUS_SIMULATOR_ACTIVE


def command_block(command: int, seq: int, *, execute: int = 1, stop: int = 0, reset: int = 0, slot: int = 0, magazine_id: int = 0, heartbeat: int = 1) -> list[int]:
    return [command, execute, stop, reset, slot, magazine_id, 0, seq, heartbeat]


def run_until_terminal(model: RobotModel, limit: int = 3000) -> None:
    now = 100.0
    for _ in range(limit):
        now += 0.01
        model.tick(0.01, now)
        if model.execution_state in {ExecutionState.DONE, ExecutionState.ERROR, ExecutionState.STOPPED}:
            return
    raise AssertionError("Command did not reach terminal state")


def test_movement_handshake_and_execute_is_not_motion_enable() -> None:
    model = build_model()
    model.accept_command_registers(command_block(CommandCode.MACHINE_1_ABOVE, 1), now=100.0)
    assert model.ack_seq == 1
    assert model.execution_state == ExecutionState.BUSY

    # Falling Execute is ignored while BUSY; only Stop may cancel the action.
    model.accept_command_registers(command_block(0, 1, execute=0, heartbeat=2), now=100.1)
    assert model.execution_state == ExecutionState.BUSY
    run_until_terminal(model)
    assert model.execution_state == ExecutionState.DONE
    assert model.current_point == CommandCode.MACHINE_1_ABOVE
    assert model.position == pytest.approx([2010.0, 250.0, 350.0], abs=0.05)

    model.accept_command_registers(command_block(0, 1, execute=0, heartbeat=3), now=200.0)
    assert model.execution_state == ExecutionState.IDLE
    assert model.ack_seq == 1


def test_same_sequence_never_repeats_and_new_sequence_can_retry() -> None:
    model = RobotModel(copy.deepcopy(DEFAULT_CONFIG))
    model.accept_command_registers(command_block(CommandCode.HOME_SAFETY, 10), now=1.0)
    assert model.ack_seq == 10
    assert model.execution_state == ExecutionState.ERROR
    model.accept_command_registers(command_block(0, 10, execute=0, heartbeat=2), now=1.1)
    assert model.execution_state == ExecutionState.IDLE
    assert model.set_mode(RobotMode.AUTOMATIC)

    model.accept_command_registers(command_block(CommandCode.HOME_SAFETY, 10, heartbeat=3), now=1.3)
    assert model.execution_state == ExecutionState.IDLE
    model.accept_command_registers(command_block(CommandCode.HOME_SAFETY, 11, heartbeat=4), now=1.4)
    assert model.execution_state in {ExecutionState.BUSY, ExecutionState.DONE}


def test_zero_distance_motion_keeps_busy_visible_for_modbus_polling() -> None:
    model = build_model()
    model.accept_command_registers(command_block(CommandCode.HOME_SAFETY, 21), now=1.0)
    assert model.execution_state == ExecutionState.BUSY
    model.tick(0.10, 1.10)
    assert model.execution_state == ExecutionState.BUSY
    model.tick(0.06, 1.16)
    assert model.execution_state == ExecutionState.DONE


def test_fast_gripper_action_keeps_busy_visible_for_modbus_polling() -> None:
    model = build_model()
    model.set_fast_mode(True, 250.0)
    model.accept_command_registers(command_block(CommandCode.GRIPPER_1_CLOSE, 22), now=1.0)
    model.tick(0.10, 1.10)
    assert model.execution_state == ExecutionState.BUSY
    model.tick(0.06, 1.16)
    assert model.execution_state == ExecutionState.DONE


def test_stop_motion_latches_alarm_and_reset_requires_released_controls() -> None:
    model = build_model()
    model.accept_command_registers(command_block(CommandCode.MACHINE_3_ABOVE, 2), now=10.0)
    for index in range(20):
        model.tick(0.01, 10.01 + index * 0.01)
    model.accept_command_registers(command_block(CommandCode.MACHINE_3_ABOVE, 2, stop=1, heartbeat=2), now=10.3)
    run_until_terminal(model)
    assert model.execution_state == ExecutionState.STOPPED
    assert model.result_code == ResultCode.STOPPED
    assert model.latched_alarm == AlarmCode.EXTERNAL_STOP
    assert model.current_point == 0

    model.accept_command_registers(command_block(0, 2, execute=0, stop=0, reset=1, heartbeat=3), now=20.0)
    assert model.execution_state == ExecutionState.IDLE
    assert model.latched_alarm == AlarmCode.NONE


def test_stop_during_gripper_finishes_action_before_stopped() -> None:
    model = build_model()
    model.accept_command_registers(command_block(CommandCode.GRIPPER_1_CLOSE, 3), now=20.0)
    model.accept_command_registers(command_block(CommandCode.GRIPPER_1_CLOSE, 3, stop=1, heartbeat=2), now=20.01)
    assert model.execution_state == ExecutionState.BUSY
    assert model.gripper_status & GRIPPER_1_OPEN
    for index in range(20):
        model.tick(0.01, 20.02 + index * 0.01)
    assert model.execution_state == ExecutionState.STOPPED
    assert model.gripper_status & GRIPPER_1_CLOSED
    assert not model.gripper_status & GRIPPER_1_OPEN


def test_manual_and_stopped_modes_reject_external_commands() -> None:
    for mode in (RobotMode.STOPPED, RobotMode.MANUAL):
        model = RobotModel(copy.deepcopy(DEFAULT_CONFIG))
        if mode == RobotMode.MANUAL:
            assert model.set_mode(mode)
        model.accept_command_registers(command_block(CommandCode.HOME_SAFETY, 5), now=1.0)
        assert model.ack_seq == 5
        assert model.execution_state == ExecutionState.ERROR
        assert model.result_code == ResultCode.NOT_READY


def test_magazine_slot_math_and_validation() -> None:
    model = build_model()
    assert model.resolve_point(CommandCode.MAGAZINE_IN_SLOT, 1, 1)[:3] == (4230.0, 200.0, 1600.0)
    assert model.resolve_point(CommandCode.MAGAZINE_SAFE, 10, 1)[:3] == (4770.0, 200.0, 0.0)
    assert model.resolve_point(CommandCode.MAGAZINE_SAFE, 111, 1)[:3] == (4230.0, 860.0, 0.0)
    assert model.resolve_point(CommandCode.MAGAZINE_CHANGE, 120, 1)[:3] == (4770.0, 860.0, 1400.0)
    assert model.resolve_point(CommandCode.MAGAZINE_SAFE, 0, 1) is None
    assert model.resolve_point(CommandCode.MAGAZINE_SAFE, 121, 1) is None
    assert model.resolve_point(CommandCode.MAGAZINE_SAFE, 1, 0) is None
    assert model.resolve_point(CommandCode.MAGAZINE_SAFE, 1, 3) is None


def test_modbus_v3_selects_second_magazine_geometry() -> None:
    model = build_model()
    model.config["magazine_2"]["base_x"] = 9000.0
    model.accept_command_registers(
        command_block(CommandCode.MAGAZINE_IN_SLOT, 30, slot=120, magazine_id=2),
        now=1.0,
    )
    assert model.ack_seq == 30
    assert model.execution_state == ExecutionState.BUSY
    run_until_terminal(model)
    assert model.position == pytest.approx([9540.0, 860.0, 1600.0], abs=0.05)


def test_local_panel_selects_second_magazine_geometry() -> None:
    model = RobotModel(copy.deepcopy(DEFAULT_CONFIG))
    model.config["magazine_2"]["base_x"] = 9000.0
    assert model.set_mode(RobotMode.MANUAL)
    assert model.local_command(CommandCode.MAGAZINE_IN_SLOT, slot=1, magazine_id=2)
    run_until_terminal(model)
    assert model.position == pytest.approx([9000.0, 200.0, 1600.0], abs=0.05)


def test_coordinate_words_are_signed_high_word_first() -> None:
    model = build_model()
    model.position[:] = [-12.3, 456.7, -0.1]
    registers = model.status_registers()
    assert registers[9:11] == [0xFFFF, 0xFF85]
    assert registers[11:13] == [0x0000, 0x11D7]
    assert registers[13:15] == [0xFFFF, 0xFFFF]


def test_mode_change_is_blocked_during_command() -> None:
    model = build_model()
    model.accept_command_registers(command_block(CommandCode.MACHINE_2_ABOVE, 7), now=1.0)
    assert not model.set_mode(RobotMode.MANUAL)
    assert model.mode == RobotMode.AUTOMATIC


def test_injected_motion_fault_uses_motion_result_not_stop_result() -> None:
    model = build_model()
    model.accept_command_registers(command_block(CommandCode.MACHINE_3_ABOVE, 8), now=1.0)
    for index in range(20):
        model.tick(0.01, 1.01 + index * 0.01)
    model.set_fault_source("motion_fault", True)
    run_until_terminal(model)
    assert model.execution_state == ExecutionState.ERROR
    assert model.result_code == ResultCode.MOTION_ERROR
    assert model.latched_alarm == AlarmCode.MOTION_FAULT


def test_plc_heartbeat_loss_stops_motion_and_requires_recovery_then_reset() -> None:
    model = build_model()
    model.config["server"]["plc_heartbeat_timeout_s"] = 0.5
    model.accept_command_registers(command_block(CommandCode.MACHINE_3_ABOVE, 9, heartbeat=10), now=10.0)
    model.tick(0.6, 10.6)
    run_until_terminal(model)
    assert model.execution_state == ExecutionState.STOPPED
    assert model.result_code == ResultCode.STOPPED
    assert model.latched_alarm == AlarmCode.PLC_HEARTBEAT_LOST
    assert not model.is_ready

    model.accept_command_registers(command_block(0, 9, execute=0, heartbeat=11), now=20.0)
    assert model.execution_state == ExecutionState.IDLE
    assert model.latched_alarm == AlarmCode.PLC_HEARTBEAT_LOST
    model.accept_command_registers(command_block(0, 9, execute=0, reset=1, heartbeat=12), now=20.1)
    assert model.latched_alarm == AlarmCode.NONE
    assert model.execution_state == ExecutionState.IDLE


def test_plc_heartbeat_loss_waits_for_gripper_action_completion() -> None:
    model = build_model()
    model.config["server"]["plc_heartbeat_timeout_s"] = 0.5
    model.accept_command_registers(command_block(CommandCode.GRIPPER_1_CLOSE, 12, heartbeat=20), now=30.0)
    model.tick(0.01, 30.6)
    assert model.execution_state == ExecutionState.BUSY
    for index in range(20):
        model.tick(0.01, 30.61 + index * 0.01)
    assert model.execution_state == ExecutionState.STOPPED
    assert model.gripper_status & GRIPPER_1_CLOSED
    assert model.latched_alarm == AlarmCode.PLC_HEARTBEAT_LOST


def test_submillimetre_manual_move_reaches_target() -> None:
    model = RobotModel(copy.deepcopy(DEFAULT_CONFIG))
    assert model.set_mode(RobotMode.MANUAL)
    assert model.local_move_xyz(0.25, 0.0, 0.0)
    run_until_terminal(model, limit=10_000)
    assert model.execution_state == ExecutionState.DONE
    assert model.position == pytest.approx([0.25, 0.0, 0.0], abs=0.01)


def test_new_command_is_not_accepted_while_stop_is_high() -> None:
    model = build_model()
    model.accept_command_registers(
        command_block(CommandCode.HOME_SAFETY, 20, stop=1),
        now=1.0,
    )
    assert model.ack_seq == 0
    assert model.execution_state == ExecutionState.IDLE
