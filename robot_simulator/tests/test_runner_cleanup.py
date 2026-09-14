from __future__ import annotations

import asyncio
import json
from typing import Any

from robot_simulator.constants import RobotMode
from robot_simulator.test_runner import GatewayRunner
from robot_simulator.test_scenarios import smoke_scenarios


class RecordingRunner(GatewayRunner):
    def __init__(self) -> None:
        self.run_id = "1"
        self.token = "test"
        self.base_uri = "ws://unused"
        self.values: dict[str, Any] = {}
        self._simulator_session_acquired = False
        self._simulator_control_error = ""
        self._cleanup_active = False
        self.speed_profile = "realtime"
        self.environment = "simulation"
        self.robot_interface = "softmotion"
        self.simulation_factor = 1
        self._hmi_heartbeat = 0
        self._initial_modbus_mode = False
        self._initial_simulator_mode = RobotMode.STOPPED
        self._interface_changed = False
        self._initial_environment = 0
        self._initial_speed = 0
        self._environment_changed = False
        self._speed_changed = False
        self._plc_control_started = False
        self._abort_requested = False
        self.commands: list[tuple[str, dict[str, Any]]] = []

    async def command(self, _socket: Any, command: str, **fields: Any) -> None:
        self.commands.append((command, fields))


def test_idle_cell_does_not_receive_a_stop_command() -> None:
    runner = RecordingRunner()
    asyncio.run(runner.stop_cell_if_running(object()))
    assert runner.commands == []


def test_running_cell_receives_one_stop_command() -> None:
    runner = RecordingRunner()
    runner.values["stCellStatus.xRunning"] = True
    asyncio.run(runner.stop_cell_if_running(object()))
    assert runner.commands == [("cell.stop", {})]


def test_general_suite_is_available_to_the_runner() -> None:
    cases = GatewayRunner.suite({"suite": "general"})
    assert len(cases) == 8
    assert all(case["expectations"]["testKind"] == "general-four-batches" for case in cases)


def test_general_batch_handover_allows_finished_flag_to_arrive_next_scan() -> None:
    values = {
        "stCellStatus.uiActiveMagazine": 1,
        "astMagazineStatus[2].udiProducedPartsTotal": 120,
        "astMagazineStatus[2].xFinished": False,
        "astMagazineStatus[2].xEditAllowed": False,
    }

    assert GatewayRunner.general_batch_state_valid(values, 2, 1, 0, 120)
    values["astMagazineStatus[2].udiProducedPartsTotal"] = 119
    assert not GatewayRunner.general_batch_state_valid(values, 2, 1, 0, 120)


def test_general_reload_uses_clear_fill_enable_in_order() -> None:
    class ReloadRunner(RecordingRunner):
        async def wait_general_condition(
            self, _socket: Any, predicate: Any, _label: str, **_fields: Any,
        ) -> None:
            assert predicate(self.values)

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            magazine = int(fields["magazine"])
            if command == "magazine.clear":
                for slot in range(1, 121):
                    root = f"astMagazineInventory[{magazine}].aSlots[{slot}]"
                    self.values[f"{root}.xInPosition"] = False
                    self.values[f"{root}.eDetailType"] = 0
                    self.values[f"{root}.uiProductType"] = 0
                self.values[f"astMagazineStatus[{magazine}].xFillAllowed"] = True
            elif command == "magazine.fill":
                for slot in range(1, 121):
                    root = f"astMagazineInventory[{magazine}].aSlots[{slot}]"
                    self.values[f"{root}.xInPosition"] = True
                    self.values[f"{root}.eDetailType"] = 1
                    self.values[f"{root}.uiProductType"] = 1
                self.values[f"astMagazineStatus[{magazine}].xEnableSequenceAllowed"] = True
            elif command == "magazine.enable":
                self.values[f"astMagazineStatus[{magazine}].xEnabled"] = True
                self.values[f"astMagazineStatus[{magazine}].xReady"] = True
                self.values[f"astMagazineStatus[{magazine}].xFinished"] = False

    runner = ReloadRunner()
    runner.values.update({
        "stCellStatus.uiActiveMagazine": 2,
        "stCellStatus.xRunning": True,
        "astMagazineStatus[1].xFinished": True,
        "astMagazineStatus[1].xClearAllowed": True,
    })
    for slot in range(1, 121):
        root = f"astMagazineInventory[1].aSlots[{slot}]"
        runner.values[f"{root}.xInPosition"] = True
        runner.values[f"{root}.eDetailType"] = 2
        runner.values[f"{root}.uiProductType"] = 1

    asyncio.run(runner.reload_general_magazine(
        object(), 1, active_magazine=2, warning_baseline=0,
    ))

    assert runner.commands == [
        ("magazine.clear", {"magazine": 1}),
        ("magazine.fill", {"magazine": 1}),
        ("magazine.enable", {"magazine": 1}),
    ]
    assert runner.magazine_inventory_counts(runner.values, 1) == (120, 0, 0)


def test_general_prepare_forces_magazine_one_priority_and_clears_old_warnings() -> None:
    class PrepareRunner(RecordingRunner):
        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "alarms.resetWarnings":
                self.values["stAlarmStatus.uiActiveWarningCount"] = 0
            elif command == "magazine.disable":
                self.values["astMagazineStatus[2].xEnabled"] = False
                self.values["astMagazineStatus[2].xReady"] = False
                self.values["astMagazineStatus[2].xEnableSequenceAllowed"] = True
                self.values["stCellStatus.uiActiveMagazine"] = 1
            elif command == "magazine.enable":
                self.values["astMagazineStatus[2].xEnabled"] = True
                self.values["astMagazineStatus[2].xReady"] = True

    runner = PrepareRunner()
    runner.values.update({
        "stAlarmStatus.uiActiveWarningCount": 2,
        "stCellStatus.uiActiveMagazine": 2,
        "astMagazineStatus[1].xEnabled": True,
        "astMagazineStatus[1].xReady": True,
        "astMagazineStatus[2].xEnabled": True,
        "astMagazineStatus[2].xReady": True,
    })

    asyncio.run(runner.prepare_general_cycle(object()))

    assert runner.commands == [
        ("alarms.resetWarnings", {}),
        ("magazine.disable", {"magazine": 2}),
        ("magazine.enable", {"magazine": 2}),
    ]
    assert runner.values["stCellStatus.uiActiveMagazine"] == 1


def test_failed_startup_cleanup_does_not_touch_plc_operating_modes() -> None:
    runner = RecordingRunner()
    asyncio.run(runner.cleanup_run(object()))
    assert runner.commands == [("test.session", {"value": False})]


def test_aborted_startup_asserts_and_releases_plc_abort_without_homing() -> None:
    runner = RecordingRunner()
    runner._abort_requested = True

    asyncio.run(runner.cleanup_run(object()))

    assert runner.commands == [
        ("test.abort", {"value": True}),
        ("test.abort", {"value": False}),
        ("test.session", {"value": False}),
    ]


def test_active_abort_stops_without_starting_home_recovery() -> None:
    class AbortRunner(RecordingRunner):
        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "test.abort" and fields.get("value") is True:
                self.values["stCellStatus.xRunning"] = False
                self.values["stRobotStatus.xBusy"] = False

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            assert predicate(self.values), label

        async def ensure_manual_control(self, _socket: Any) -> None:
            return

        async def reset_robot_and_cell(self, _socket: Any, **_fields: Any) -> None:
            return

        async def ensure_safety_home(self, _socket: Any) -> None:
            raise AssertionError("aborted run must not start a HOME movement")

    runner = AbortRunner()
    runner._plc_control_started = True
    runner._abort_requested = True
    runner.values.update({
        "stCellStatus.xRunning": True,
        "stCellStatus.xStopPending": False,
        "stRobotStatus.xBusy": True,
    })

    asyncio.run(runner.cleanup_run(object()))

    assert runner.commands == [
        ("test.abort", {"value": True}),
        ("test.faults.clear", {}),
        ("test.abort", {"value": False}),
        ("test.session", {"value": False}),
    ]


def test_automatic_start_waits_for_plc_start_permission() -> None:
    class Socket:
        def __init__(self) -> None:
            self.snapshots = [
                {
                    "xCellManual": False,
                    "stCellStatus.xStartCheckAutomaticMode": True,
                    "stCellStatus.xStartAllowed": True,
                    "stCellStatus.xRunning": False,
                },
                {
                    "stCellStatus.xRunning": True,
                },
            ]

        async def recv(self) -> str:
            return json.dumps({
                "type": "snapshot",
                "values": self.snapshots.pop(0),
            })

    runner = RecordingRunner()
    runner.values.update({
        "xCellManual": True,
        "stCellStatus.xStartCheckAutomaticMode": False,
        "stCellStatus.xStartAllowed": False,
    })
    asyncio.run(runner.start_automatic_cycle(Socket()))
    assert runner.commands == [
        ("cell.manual", {"value": False}),
        ("cell.start", {}),
    ]


def test_automatic_start_accepts_plc_prestart_prompt_before_running() -> None:
    class Socket:
        async def recv(self) -> str:
            return json.dumps({
                "type": "snapshot",
                "values": {
                    "stCellStatus.xOperatorPromptActive": True,
                    "stCellStatus.uiOperatorPrompt": 1,
                    "stCellStatus.xRunning": False,
                },
            })

    runner = RecordingRunner()
    runner.values.update({
        "stCellStatus.xStartCheckAutomaticMode": True,
        "stCellStatus.xStartAllowed": True,
        "stCellStatus.xOperatorPromptActive": False,
        "stCellStatus.xRunning": False,
    })

    asyncio.run(runner.start_automatic_cycle(Socket()))

    assert runner.commands == [
        ("cell.manual", {"value": False}),
        ("cell.start", {}),
    ]
    assert runner.values["stCellStatus.xOperatorPromptActive"] is True


def test_manual_mode_stops_running_cell_before_requesting_mode() -> None:
    class ManualRunner(RecordingRunner):
        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            if label == "cell did not stop before entering manual mode":
                self.values["stCellStatus.xRunning"] = False
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "cell.manual":
                self.values["xCellManual"] = True
                self.values["stCellStatus.xStartCheckAutomaticMode"] = False

    runner = ManualRunner()
    runner.values.update({
        "stCellStatus.xRunning": True,
        "stCellStatus.xStopPending": False,
        "xCellManual": False,
        "stCellStatus.xStartCheckAutomaticMode": True,
        "xHmiConnectionAlive": True,
        "stRobotStatus.xBusy": False,
    })

    asyncio.run(runner.ensure_manual_control(object()))

    assert runner.commands == [
        ("cell.stop", {}),
        ("cell.manual", {"value": True}),
    ]


def test_recovery_restores_softmotion_drives_after_a_failed_case() -> None:
    class DriveRunner(RecordingRunner):
        async def ensure_manual_control(self, _socket: Any) -> None:
            return

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "robot.enableDrives":
                self.values["stRobotHmiStatus.xDrivesPowered"] = True
                self.values["stCellStatus.xDrivesReady"] = True

    runner = DriveRunner()
    runner.values.update({
        "xModbusMode": False,
        "stRobotHmiStatus.xDrivesPowered": False,
        "stRobotHmiStatus.xDrivesEnableAllowed": True,
        "stCellStatus.xDrivesReady": False,
    })

    asyncio.run(runner.ensure_softmotion_drives(object()))

    assert runner.commands == [("robot.enableDrives", {})]


def test_recovery_does_not_touch_drives_in_modbus_mode() -> None:
    runner = RecordingRunner()
    runner.robot_interface = "python-modbus"
    runner.values["xModbusMode"] = True

    asyncio.run(runner.ensure_softmotion_drives(object()))

    assert runner.commands == []


def test_automatic_mode_level_write_retries_until_plc_feedback_changes() -> None:
    class RetryRunner(RecordingRunner):
        def __init__(self) -> None:
            super().__init__()
            self.wait_attempts = 0

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            self.wait_attempts += 1
            if self.wait_attempts == 1:
                raise TimeoutError(label)
            self.values["stCellStatus.xStartCheckAutomaticMode"] = True
            assert predicate(self.values), label

    runner = RetryRunner()
    runner.values["stCellStatus.xStartCheckAutomaticMode"] = False

    asyncio.run(runner.enter_automatic_mode(object()))

    assert runner.commands == [
        ("cell.manual", {"value": False}),
        ("cell.manual", {"value": False}),
    ]


def test_robot_fault_reset_waits_for_robot_and_cell_reset_completion() -> None:
    class ResetRunner(RecordingRunner):
        async def ensure_manual_control(self, _socket: Any) -> None:
            return

        async def wait_value(self, _socket: Any, predicate: Any, _timeout: float, label: str) -> None:
            assert predicate(self.values), label

        async def wait_stable_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str, **_fields: Any,
        ) -> None:
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "robot.reset":
                self.values.update({
                    "stRobotStatus.xError": False,
                    "stRobotDiag.eState": 0,
                    "stRobotModbusStatus.xRobotAlarm": False,
                    "stRobotModbusStatus.xError": False,
                    "stRobotModbusStatus.uiAlarmCode": 0,
                    "stRobotModbusStatus.uiExecutionState": 0,
                    "stRobotModbusStatus.xReady": True,
                })
            elif command == "cell.reset":
                self.values.update({
                    "stRobotStatus.xError": False,
                    "stRobotDiag.eState": 0,
                    "stCellStatus.xError": False,
                    "xGlobalError": False,
                    "stTestObservability.uiErrorSource": 0,
                })

    runner = ResetRunner()
    runner.values.update({
        "xModbusMode": True,
        "xRobotReset": False,
        "xCellReset": False,
        "stRobotStatus.xResetAllowed": True,
        "stRobotHmiStatus.xResetAllowed": True,
        "stCellStatus.xResetAllowed": True,
        "stRobotStatus.xError": True,
        "stRobotDiag.eState": 4,
        "stRobotModbusStatus.xCommunicationAlive": True,
        "stRobotModbusStatus.xRobotAlarm": True,
        "stRobotModbusStatus.xError": True,
        "stRobotModbusStatus.uiAlarmCode": 101,
        "stRobotModbusStatus.uiExecutionState": 4,
        "stRobotModbusStatus.xReady": False,
        "stCellStatus.xError": True,
        "xGlobalError": True,
        "stTestObservability.uiErrorSource": 2,
    })

    asyncio.run(runner.reset_robot_and_cell(object(), robot_fault_expected=True))

    assert runner.commands == [("robot.reset", {}), ("cell.reset", {})]
    assert GatewayRunner.fault_reset_complete(runner.values)


def test_home_recovery_uses_actual_tolerance_instead_of_stale_point_name() -> None:
    class HomeRunner(RecordingRunner):
        async def robot_action(
            self, _socket: Any, action: int, predicate: Any, *, point: int = 0,
        ) -> None:
            assert not predicate(self.values)
            self.commands.append(("robot.action", {"action": action, "point": point}))
            self.values["stCellStatus.xRobotAtSafetyHome"] = True

        async def wait_stable_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str, **_fields: Any,
        ) -> None:
            assert predicate(self.values), label

    runner = HomeRunner()
    runner.values.update({
        "stRobotStatus.eCurrentPoint": 17,
        "stCellStatus.xRobotAtSafetyHome": False,
    })

    asyncio.run(runner.ensure_safety_home(object()))

    assert runner.commands == [("robot.action", {"action": 1, "point": 13})]


def test_fast_robot_action_accepts_completed_feedback_without_observed_busy() -> None:
    class FastActionRunner(RecordingRunner):
        async def ensure_manual_control(self, _socket: Any) -> None:
            return

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "robot.action":
                # FAST action starts and finishes between OPC UA publications.
                self.values["stRobotStatus.xGripper1Closed"] = True

    runner = FastActionRunner()
    runner.values.update({
        "xRobotManualExecute": False,
        "stRobotHmiStatus.xGripper1CloseAllowed": True,
        "stRobotStatus.xGripper1Closed": False,
        "stRobotStatus.xBusy": False,
        "stRobotHmiStatus.xCommandBusy": False,
        "xModbusMode": False,
    })

    asyncio.run(runner.robot_action(
        object(), 3, lambda values: bool(values.get("stRobotStatus.xGripper1Closed", False)),
    ))

    assert runner.commands == [("robot.action", {"action": 3, "point": 0, "slot": 0})]


def test_softmotion_setup_does_not_enable_already_powered_drives() -> None:
    class PoweredRunner(RecordingRunner):
        async def stop_cell_if_running(self, _socket: Any) -> None:
            return

        async def ensure_manual_control(self, _socket: Any) -> None:
            return

        async def wait_softmotion_acceleration(
            self, _socket: Any, _speed_code: int, _timeout: float,
        ) -> None:
            return

    runner = PoweredRunner()
    runner.values.update({
        "xModbusMode": False,
        "uiTestEnvironmentApplied": 1,
        "uiTestSpeedProfileApplied": 0,
        "stRobotHmiStatus.xDrivesPowered": True,
    })

    asyncio.run(runner.configure_run(object(), {
        "robotInterface": "softmotion",
        "environment": "simulation",
        "speedProfile": "realtime",
    }))

    assert runner.commands == []


def test_softmotion_setup_only_queues_requested_factor() -> None:
    class FactorRunner(RecordingRunner):
        async def stop_cell_if_running(self, _socket: Any) -> None:
            return

        async def ensure_manual_control(self, _socket: Any) -> None:
            return

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "simulation.accelerationFactor":
                self.values["uiSimulationTimeFactor"] = int(fields["value"])

    runner = FactorRunner()
    runner.values.update({
        "xModbusMode": False,
        "uiTestEnvironmentApplied": 1,
        "uiTestSpeedProfileApplied": 1,
        "uiSimulationTimeFactor": 25,
        "stRobotHmiStatus.xDrivesPowered": True,
    })

    asyncio.run(runner.configure_run(object(), {
        "robotInterface": "softmotion",
        "environment": "simulation",
        "speedProfile": "fast",
        "simulationTimeFactor": 12,
    }))

    assert runner.commands == [("simulation.accelerationFactor", {"value": 12})]


def test_scenario_apply_retries_busy_rejection_after_apply_pulse_falls() -> None:
    class ScenarioRunner(RecordingRunner):
        def __init__(self) -> None:
            super().__init__()
            self.apply_count = 0
            self.values.update({
                "xTestScenarioApply": False,
                "xTestScenarioApplyAllowed": True,
                "stTestScenario.udiLoadSeq": 10,
                "udiTestScenarioAckSeq": 10,
                "uiTestScenarioResult": 0,
                "uiSimulationTimeFactor": 1,
                "uiSimulationTimeFactorApplied": 1,
                "xSimulationAccelerationActive": False,
                "xSimulationAccelerationBusy": False,
            })

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            if "pulse did not return to zero" in label:
                self.values["xTestScenarioApply"] = False
            elif label == "PLC does not allow applying the test scenario":
                self.values["xTestScenarioApplyAllowed"] = True
            assert predicate(self.values), label

        async def wait_for(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> dict[str, Any]:
            assert predicate({}, self.values), label
            return {}

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "test.scenario.apply":
                self.apply_count += 1
                load_seq = 10 + self.apply_count
                self.values.update({
                    "xTestScenarioApply": True,
                    "xTestScenarioApplyAllowed": False,
                    "stTestScenario.udiLoadSeq": load_seq,
                    "udiTestScenarioAckSeq": load_seq,
                    "uiTestScenarioResult": 1 if self.apply_count == 1 else 0,
                })

    runner = ScenarioRunner()
    applied = asyncio.run(runner.apply_scenario(object(), smoke_scenarios()[0]))

    assert applied
    assert [command for command, _fields in runner.commands].count("test.scenario.apply") == 2


def test_speed_profile_can_change_while_equipment_is_running() -> None:
    class SpeedRunner(RecordingRunner):
        def __init__(self) -> None:
            super().__init__()
            self.wait_labels: list[str] = []
            self.values.update({
                "xTestSpeedProfileApply": True,
                "stCellStatus.xRunning": True,
                "uiTestSpeedProfileApplied": 1,
            })

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            self.wait_labels.append(label)
            if label == "previous test speed pulse did not return to zero":
                self.values["xTestSpeedProfileApply"] = False
            elif label == "test speed pulse did not return to zero":
                self.values["xTestSpeedProfileApply"] = False
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "test.speed.set":
                self.values["xTestSpeedProfileApply"] = True
                self.values["uiTestSpeedProfileApplied"] = int(fields["value"])

    runner = SpeedRunner()
    asyncio.run(runner.set_test_speed_profile(
        object(), 0, timeout=30.0, label="speed confirmation",
    ))

    assert runner.commands == [("test.speed.set", {"value": 0})]
    assert runner.wait_labels == [
        "previous test speed pulse did not return to zero",
        "speed confirmation",
        "test speed pulse did not return to zero",
    ]


def test_environment_restore_waits_for_permission_and_restores_limits() -> None:
    class EnvironmentRunner(RecordingRunner):
        def __init__(self) -> None:
            super().__init__()
            self.wait_labels: list[str] = []
            self.limit_factors: list[int] = []
            self._initial_environment = 0
            self.values.update({
                "xTestEnvironmentChangeAllowed": False,
                "uiTestEnvironmentApplied": 1,
                "xModbusMode": False,
            })

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            self.wait_labels.append(label)
            if label == "PLC did not allow restoring the initial test environment":
                self.values["xTestEnvironmentChangeAllowed"] = True
            assert predicate(self.values), label

        async def command(self, _socket: Any, command: str, **fields: Any) -> None:
            self.commands.append((command, fields))
            if command == "test.environment.set":
                self.values["uiTestEnvironmentApplied"] = int(fields["value"])

        async def wait_softmotion_acceleration(
            self, _socket: Any, expected_factor: int, _timeout: float,
        ) -> None:
            self.limit_factors.append(expected_factor)

    runner = EnvironmentRunner()
    asyncio.run(runner.restore_test_environment(object()))

    assert runner.commands == [("test.environment.set", {"value": 0})]
    assert runner.wait_labels == [
        "PLC did not allow restoring the initial test environment",
        "test environment did not return to its initial value",
    ]
    assert runner.limit_factors == [1]
