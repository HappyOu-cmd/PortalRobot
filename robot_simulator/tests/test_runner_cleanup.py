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
        self._hmi_heartbeat = 0
        self._initial_modbus_mode = False
        self._initial_simulator_mode = RobotMode.STOPPED
        self._interface_changed = False
        self._initial_environment = 0
        self._initial_speed = 0
        self._environment_changed = False
        self._speed_changed = False
        self._plc_control_started = False
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


def test_failed_startup_cleanup_does_not_touch_plc_operating_modes() -> None:
    runner = RecordingRunner()
    asyncio.run(runner.cleanup_run(object()))
    assert runner.commands == [("test.session", {"value": False})]


def test_automatic_start_waits_for_plc_start_permission() -> None:
    class Socket:
        async def recv(self) -> str:
            return json.dumps({
                "type": "snapshot",
                "values": {
                    "xCellManual": False,
                    "stCellStatus.xStartCheckAutomaticMode": True,
                    "stCellStatus.xStartAllowed": True,
                },
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


def test_speed_profile_waits_for_idle_equipment_and_pulse_edges() -> None:
    class SpeedRunner(RecordingRunner):
        def __init__(self) -> None:
            super().__init__()
            self.wait_labels: list[str] = []
            self.values.update({
                "xTestSpeedProfileApply": True,
                "xTestEnvironmentChangeAllowed": False,
                "uiTestSpeedProfileApplied": 1,
            })

        async def wait_value(
            self, _socket: Any, predicate: Any, _timeout: float, label: str,
        ) -> None:
            self.wait_labels.append(label)
            if label == "previous test speed pulse did not return to zero":
                self.values["xTestSpeedProfileApply"] = False
            elif label == "PLC equipment did not become idle for the test speed change":
                self.values["xTestEnvironmentChangeAllowed"] = True
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
        "PLC equipment did not become idle for the test speed change",
        "speed confirmation",
        "test speed pulse did not return to zero",
    ]
