from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from collections.abc import Callable
from contextlib import suppress
from typing import Any
from urllib.parse import urlencode

import websockets

from .constants import ExecutionState, PROTOCOL_VERSION, RobotMode
from .control_api import (
    CONTROL_API_VERSION,
    CONTROL_SERVICE_NAME,
    RobotControlClient,
)
from .recovery_runner import RecoveryRunnerMixin
from .test_scenarios import (
    expected_error_owner,
    expected_first_decision,
    fixed_scenarios,
    for_magazine_mode,
    generated_scenarios,
    validate_inventory,
)


class RunAborted(RuntimeError):
    pass


class RecoveryError(RuntimeError):
    """The cell is not clean enough to execute another independent test case."""


class GatewayRunner(RecoveryRunnerMixin):
    def __init__(self) -> None:
        self.run_id = os.environ["PORTAL_TEST_RUN_ID"]
        self.token = os.environ["PORTAL_TEST_RUN_TOKEN"]
        self.base_uri = os.environ.get("PORTAL_TEST_WS", "ws://127.0.0.1:3001/ws")
        self.values: dict[str, Any] = {}
        self.simulator_control = RobotControlClient(
            os.environ.get("PORTAL_ROBOT_SIM_CONTROL_URL", "http://127.0.0.1:8765"),
            self.token,
        )
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
        self.case_checks: list[dict[str, Any]] = []

    async def send(self, socket: Any, payload: dict[str, Any]) -> None:
        await socket.send(json.dumps(payload, ensure_ascii=False))

    async def wait_for(
        self,
        socket: Any,
        predicate: Callable[[dict[str, Any], dict[str, Any]], bool],
        timeout: float,
        label: str,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        try:
            while time.monotonic() < deadline:
                control_error = getattr(self, "_simulator_control_error", "")
                if control_error and not getattr(self, "_cleanup_active", False):
                    raise RuntimeError(
                        f"Lost test-control connection to the running simulator: "
                        f"{control_error}"
                    )
                remaining = max(0.1, deadline - time.monotonic())
                message = json.loads(await asyncio.wait_for(socket.recv(), timeout=remaining))
                if message.get("type") == "test-abort-requested":
                    self._abort_requested = True
                    raise RunAborted("test run was aborted by the operator")
                if message.get("type") == "snapshot":
                    self.values.update(message.get("values", {}))
                    if (
                        self.environment == "sc500_bench"
                        and bool(self.values.get("xSc500BenchKeyLost", False))
                        and not bool(self.values.get("stRobotStatus.xBusy", False))
                    ):
                        raise RuntimeError("Physical SC-500 bench key was removed; accepted command finished")
                if predicate(message, self.values):
                    return message
        except asyncio.TimeoutError as error:
            raise TimeoutError(label) from error
        raise TimeoutError(label)

    async def wait_value(
        self, socket: Any, predicate: Callable[[dict[str, Any]], bool], timeout: float, label: str,
    ) -> None:
        if predicate(self.values):
            return
        await self.wait_for(socket, lambda _message, values: predicate(values), timeout, label)

    async def wait_stable_value(
        self,
        socket: Any,
        predicate: Callable[[dict[str, Any]], bool],
        timeout: float,
        label: str,
        *,
        stable_for: float = 0.75,
    ) -> None:
        """Require a condition to remain true across several PLC snapshots."""
        stable_since = time.monotonic() if predicate(self.values) else None

        def stable(_message: dict[str, Any], values: dict[str, Any]) -> bool:
            nonlocal stable_since
            if not predicate(values):
                stable_since = None
                return False
            if stable_since is None:
                stable_since = time.monotonic()
            return time.monotonic() - stable_since >= stable_for

        await self.wait_for(socket, stable, timeout, label)

    async def command(self, socket: Any, command: str, **fields: Any) -> None:
        request_id = f"runner-{time.time_ns()}"
        await self.send(socket, {
            "type": "test-command", "requestId": request_id, "command": command, **fields,
        })
        receipt = await self.wait_for(
            socket,
            lambda message, _values: message.get("type") == "ack"
            and message.get("requestId") == request_id,
            60.0 if command == "test.scenario.apply" else 15.0,
            command,
        )
        if not receipt.get("ok"):
            raise RuntimeError(f"{command}: {receipt.get('error', 'gateway rejected command')}")

    async def maintain_hmi_heartbeat(self, socket: Any) -> None:
        """Keep the PLC HMI watchdog alive while the headless runner owns the cell."""
        self._hmi_heartbeat = int(self.values.get("udiHmiHeartbeat", 0))
        while True:
            self._hmi_heartbeat = (self._hmi_heartbeat + 1) & 0xFFFFFFFF
            if self._hmi_heartbeat == 0:
                self._hmi_heartbeat = 1
            await self.send(socket, {"type": "test-heartbeat", "value": self._hmi_heartbeat})
            await asyncio.sleep(0.5)

    async def maintain_simulator_session(self) -> None:
        while True:
            if self._simulator_session_acquired:
                try:
                    await asyncio.to_thread(self.simulator_control.heartbeat)
                except Exception as error:
                    self._simulator_control_error = str(error)
                    return
            await asyncio.sleep(2.0)

    async def stop_cell_if_running(self, socket: Any) -> None:
        """Request a cycle stop only when PLC says that a cycle can actually be stopped."""
        if (
            bool(self.values.get("stCellStatus.xRunning", False))
            and not bool(self.values.get("stCellStatus.xStopPending", False))
        ):
            await self.command(socket, "cell.stop")

    @staticmethod
    def suite(config: dict[str, Any]) -> list[dict[str, Any]]:
        suite = str(config.get("suite", "smoke")).lower()
        if suite not in {"smoke", "regression", "general", "generated", "geometry", "magazines", "acceptance", "recovery"}:
            raise ValueError(f"Неизвестный набор тестов: {suite}")
        mode = int(config.get("magazineMode", 1 if suite == "magazines" else 0))
        if suite == "general" and mode != 0:
            raise ValueError("General requires static magazines")
        if suite == "magazines" and mode != 1:
            raise ValueError("Pallet tests require twin magazines")
        recovery = suite in ("acceptance", "recovery") or any(
            c.get("expectations", {}).get("testKind") == "fault-recovery" for c in config.get("scenarios", []))
        if recovery and (config.get("environment", "simulation") != "simulation"
                         or config.get("robotInterface", "softmotion") != "softmotion"):
            raise ValueError("Acceptance/recovery requires SoftMotion SIMULATION")
        fixed_case_index = config.get("fixedCaseIndex")
        if fixed_case_index is not None and config.get("scenarios"):
            raise ValueError("Нельзя одновременно выбрать штатный тест и сохранённые сценарии")
        if config.get("scenarios"):
            for case in config["scenarios"]:
                if case.get("expectations", {}).get("testKind") == "fault-recovery":
                    state = case.get("initialState", {})
                    if (state.get("typeCount") != 1
                            or any(g.get("content") for g in state.get("grippers", []))
                            or any(state.get("geometry", {}).get("enabled", []))
                            or any(state.get("geometry", {}).get("calls", []))):
                        raise ValueError("Recovery supports one product type, initially empty grippers and disabled GK")
            if any(c.get("expectations", {}).get("testKind") == "general-four-batches" for c in config["scenarios"]):
                if mode != 0 or config.get("environment", "simulation") != "simulation":
                    raise ValueError("Saved general cycle requires static magazines and simulation")
            for case in config["scenarios"]:
                if int(case.get("schemaVersion", 2)) not in (2, 3) or int(
                    case.get("initialState", {}).get("magazineMode", 0)
                ) != int(config.get("magazineMode", 0)):
                    raise ValueError("Тип магазинов сохранённого сценария не совпадает с прогоном")
            return config["scenarios"]
        if suite == "generated":
            if fixed_case_index is not None:
                raise ValueError("Generated не содержит фиксированного теста")
            return [for_magazine_mode(c, int(config.get("magazineMode", 0))) for c in generated_scenarios(int(config.get("seed", 1)), int(config.get("count", 100)))]
        cases = [for_magazine_mode(c, mode) for c in fixed_scenarios(suite, mode)]
        if fixed_case_index is None:
            return cases
        if isinstance(fixed_case_index, bool) or not isinstance(fixed_case_index, int):
            raise ValueError("Номер штатного теста должен быть целым числом")
        if not 1 <= fixed_case_index <= len(cases):
            raise ValueError(f"В наборе {suite} нет теста #{fixed_case_index}")
        return [cases[fixed_case_index - 1]]

    @staticmethod
    def require_magazine_mode(values: dict[str, Any], expected: int) -> None:
        mode = values.get("uiMagazineMode")
        if type(mode) is not int or mode not in (0, 1) or mode != expected:
            raise RuntimeError(f"magazineMode mismatch: PLC={mode}, scenario={expected}")

    async def attach_python_simulator(self, fast: bool) -> None:
        health = await asyncio.to_thread(self.simulator_control.health)
        if health.get("service") != CONTROL_SERVICE_NAME:
            raise RuntimeError("The configured endpoint is not the Portal Robot simulator")
        if int(health.get("apiVersion", -1)) != CONTROL_API_VERSION:
            raise RuntimeError(
                f"Unsupported simulator control API version: {health.get('apiVersion')}"
            )
        if int(health.get("protocolVersion", -1)) != PROTOCOL_VERSION:
            raise RuntimeError(
                f"Simulator Modbus protocol version is {health.get('protocolVersion')}, "
                f"expected {PROTOCOL_VERSION}"
            )
        if not bool(health.get("modbus", {}).get("running", False)):
            raise RuntimeError(
                f"Running simulator reports that Modbus is stopped: "
                f"{health.get('modbus', {}).get('error', '')}"
            )
        try:
            self._initial_simulator_mode = RobotMode(
                str(health.get("robot", {}).get("mode", RobotMode.STOPPED.value))
            )
        except ValueError as error:
            raise RuntimeError("Running simulator returned an unknown robot mode") from error
        await asyncio.to_thread(self.simulator_control.acquire, fast)
        self._simulator_session_acquired = True
        self._simulator_control_error = ""

    async def release_python_simulator(self) -> None:
        if not self._simulator_session_acquired:
            return
        try:
            await asyncio.to_thread(self.simulator_control.release, stop_mode=False)
        finally:
            self._simulator_session_acquired = False

    async def configure_run(self, socket: Any, config: dict[str, Any]) -> None:
        robot_interface = str(config.get("robotInterface", "softmotion")).lower()
        self.robot_interface = robot_interface
        self.environment = str(config.get("environment", "simulation")).lower()
        self.speed_profile = str(config.get("speedProfile", "realtime")).lower()
        default_factor = 25 if self.speed_profile == "fast" else 1
        self.simulation_factor = max(
            1, min(100, int(config.get("simulationTimeFactor", default_factor))),
        )
        if self.environment == "sc500_bench" and robot_interface != "sc500-modbus":
            raise ValueError("SC-500 bench requires the sc500-modbus interface")
        if self.environment == "sc500_bench" and self.speed_profile == "fast":
            raise ValueError("FAST is forbidden on the SC-500 bench")
        if str(config.get("suite", "smoke")).lower() == "general" and self.environment != "simulation":
            raise ValueError("General tests with automatic magazine reload are simulation-only")

        if robot_interface == "python-modbus":
            await self.attach_python_simulator(self.speed_profile == "fast")

        self._plc_control_started = True

        interface_code = 0 if robot_interface == "softmotion" else 1
        environment_code = 2 if self.environment == "sc500_bench" else 1
        speed_code = 1 if self.speed_profile == "fast" else 0

        await self.stop_cell_if_running(socket)
        await self.ensure_manual_control(socket)
        if interface_code == 1 and not bool(self.values.get("xModbusMode", False)):
            await self.command(socket, "robot.disableDrives")
            await self.wait_value(
                socket, lambda values: bool(values.get("stRobotHmiStatus.xDrivesOff", False)),
                20.0, "SoftMotion drives did not switch off",
            )
        if bool(self.values.get("xModbusMode", False)) != bool(interface_code):
            await self.command(socket, "robot.controlMode.set", value=interface_code)
            await self.wait_value(
                socket, lambda values: bool(values.get("xModbusMode", False)) == bool(interface_code),
                20.0, "PLC did not apply the requested robot interface",
            )
            self._interface_changed = True
        if robot_interface == "python-modbus":
            await self.wait_value(
                socket, lambda values: bool(values.get("stRobotModbusStatus.xSimulatorActive", False)),
                20.0, "PLC did not recognize the Python simulator marker",
            )
        if int(self.values.get("uiTestEnvironmentApplied", -1)) != environment_code:
            await self.command(socket, "test.environment.set", value=environment_code)
            await self.wait_value(
                socket, lambda values: int(values.get("uiTestEnvironmentApplied", -1)) == environment_code,
                15.0, "PLC rejected the requested test environment",
            )
            self._environment_changed = True
        if int(self.values.get("uiTestSpeedProfileApplied", -1)) != speed_code:
            await self.set_test_speed_profile(
                socket,
                speed_code,
                timeout=15.0,
                label="PLC rejected the requested speed profile",
            )
            self._speed_changed = True

        if robot_interface == "softmotion" and int(
            self.values.get("uiSimulationTimeFactor", 1)
        ) != self.simulation_factor:
            await self.command(
                socket, "simulation.accelerationFactor", value=self.simulation_factor,
            )
            await self.wait_value(
                socket,
                lambda values: int(values.get("uiSimulationTimeFactor", 0))
                == self.simulation_factor,
                10.0,
                "PLC did not remember the requested simulation factor",
            )

        if interface_code == 0 and not bool(
            self.values.get("stRobotHmiStatus.xDrivesPowered", False)
        ):
            await self.command(socket, "robot.enableDrives")
            await self.wait_value(
                socket, lambda values: bool(values.get("stRobotHmiStatus.xDrivesPowered", False)),
                30.0, "SoftMotion drives are not powered",
            )

    @staticmethod
    def robot_action_permission(action: int) -> str:
        return {
            1: "stRobotHmiStatus.xPointsAllowed",
            2: "stRobotHmiStatus.xGripper1OpenAllowed",
            3: "stRobotHmiStatus.xGripper1CloseAllowed",
            4: "stRobotHmiStatus.xGripper2OpenAllowed",
            5: "stRobotHmiStatus.xGripper2CloseAllowed",
            6: "stRobotHmiStatus.xRotateToBlankAllowed",
            7: "stRobotHmiStatus.xRotateToDetailAllowed",
        }[action]

    async def ensure_manual_control(self, socket: Any) -> None:
        # Не спамить Manual в работающую ячейку: PLC штатно отклоняет такой
        # запрос и на каждый фронт создаёт предупреждение. Сначала завершаем
        # активный цикл, и только потом меняем режим.
        if bool(self.values.get("stCellStatus.xRunning", False)):
            await self.stop_cell_if_running(socket)
            await self.wait_value(
                socket,
                lambda values: not bool(values.get("stCellStatus.xRunning", False)),
                45.0,
                "cell did not stop before entering manual mode",
            )
        # Gateway подтверждает одну транзакцию режима; повторная запись скрыла бы потерю команды.
        await self.command(socket, "cell.manual", value=True)
        await self.wait_value(
            socket,
            lambda values: bool(values.get("xCellManual", False))
            and not bool(values.get("stCellStatus.xStartCheckAutomaticMode", True)),
            15.0,
            "PLC did not enter manual mode",
        )
        await self.wait_value(
            socket,
            lambda values: bool(values.get("xHmiConnectionAlive", False))
            and bool(values.get("xCellManual", False))
            and not bool(values.get("stCellStatus.xRunning", False))
            and not bool(values.get("stRobotStatus.xBusy", False)),
            20.0,
            "manual test control is not ready (HMI heartbeat, manual mode or robot idle)",
        )

    async def ensure_softmotion_drives(self, socket: Any) -> None:
        """Restore drives that a failed SoftMotion case may have powered down."""
        if self.robot_interface != "softmotion" or bool(
            self.values.get("xModbusMode", False)
        ):
            return
        if not bool(self.values.get("stRobotHmiStatus.xDrivesPowered", False)):
            await self.ensure_manual_control(socket)
            await self.wait_value(
                socket,
                lambda values: bool(
                    values.get("stRobotHmiStatus.xDrivesEnableAllowed", False)
                ),
                20.0,
                "PLC did not allow restoring SoftMotion drives after test recovery",
            )
            await self.command(socket, "robot.enableDrives")
        await self.wait_value(
            socket,
            lambda values: bool(values.get("stRobotHmiStatus.xDrivesPowered", False))
            and bool(values.get("stCellStatus.xDrivesReady", False)),
            30.0,
            "SoftMotion drives did not return to ready after test recovery",
        )

    async def begin_robot_action(
        self,
        socket: Any,
        action: int,
        *,
        point: int = 0,
        completion_predicate: Callable[[dict[str, Any]], bool] | None = None,
    ) -> None:
        await self.ensure_manual_control(socket)
        await self.wait_value(
            socket,
            lambda values: not bool(values.get("xRobotManualExecute", False)),
            5.0,
            "previous robot action pulse did not return to zero",
        )
        permission = self.robot_action_permission(action)
        await self.wait_value(
            socket,
            lambda values: bool(values.get(permission, False)),
            20.0,
            f"robot action {action} is not permitted; reject reason="
            f"{self.values.get('stRobotHmiStatus.eRejectReason', 0)}",
        )
        previous_ack = int(self.values.get("stRobotModbusStatus.uiAckSeq", 0))
        await self.command(socket, "robot.action", action=action, point=point, slot=0)
        await self.wait_value(
            socket,
            lambda values: bool(values.get("stRobotStatus.xBusy", False))
            or bool(values.get("stRobotHmiStatus.xCommandBusy", False))
            # В FAST пневматика успевает полностью отработать между двумя
            # OPC UA снимками. Конечный feedback в таком случае надёжнее
            # пропущенного промежуточного Busy.
            or (completion_predicate is not None and completion_predicate(values))
            or (
                bool(values.get("xModbusMode", False))
                and int(values.get("stRobotModbusStatus.uiAckSeq", 0)) != previous_ack
            ),
            10.0,
            f"robot action {action} was not accepted; HMI alive="
            f"{self.values.get('xHmiConnectionAlive', False)}, allowed="
            f"{self.values.get(permission, False)}, reject reason="
            f"{self.values.get('stRobotHmiStatus.eRejectReason', 0)}",
        )

    async def robot_action(
        self,
        socket: Any,
        action: int,
        predicate: Callable[[dict[str, Any]], bool],
        *,
        point: int = 0,
    ) -> None:
        if predicate(self.values):
            return
        await self.begin_robot_action(
            socket,
            action,
            point=point,
            completion_predicate=predicate,
        )
        await self.wait_value(socket, predicate, 45.0, f"robot action {action} did not reach feedback")
        await self.wait_value(
            socket,
            lambda values: not bool(values.get("stRobotStatus.xBusy", False))
            and (
                not bool(values.get("xModbusMode", False))
                or int(values.get("stRobotModbusStatus.uiExecutionState", 0)) == 0
            ),
            15.0, f"robot action {action} did not release Busy",
        )
        await self.wait_value(
            socket,
            lambda values: not bool(values.get("xRobotManualExecute", False)),
            5.0,
            f"robot action {action} pulse did not return to zero",
        )

    @staticmethod
    def robot_fault_active(values: dict[str, Any]) -> bool:
        modbus_fault = bool(values.get("xModbusMode", False)) and (
            bool(values.get("stRobotModbusStatus.xRobotAlarm", False))
            or bool(values.get("stRobotModbusStatus.xError", False))
            or int(values.get("stRobotModbusStatus.uiAlarmCode", 0)) != 0
            or int(values.get("stRobotModbusStatus.uiExecutionState", 0)) == int(ExecutionState.ERROR)
        )
        return (
            bool(values.get("stRobotStatus.xError", False))
            or int(values.get("stRobotDiag.eState", 0)) == 4
            or modbus_fault
            or int(values.get("stTestObservability.uiErrorSource", 0)) == 2
        )

    @staticmethod
    def cell_fault_active(values: dict[str, Any]) -> bool:
        return (
            bool(values.get("stCellStatus.xError", False))
            or bool(values.get("xGlobalError", False))
            or int(values.get("stTestObservability.uiErrorSource", 0)) != 0
        )

    @staticmethod
    def robot_reset_complete(values: dict[str, Any]) -> bool:
        if (
            bool(values.get("stRobotStatus.xError", False))
            or int(values.get("stRobotDiag.eState", 0)) == 4
        ):
            return False
        if not bool(values.get("xModbusMode", False)):
            return True
        return (
            bool(values.get("stRobotModbusStatus.xCommunicationAlive", False))
            and bool(values.get("stRobotModbusStatus.xReady", False))
            and not bool(values.get("stRobotModbusStatus.xRobotAlarm", False))
            and not bool(values.get("stRobotModbusStatus.xError", False))
            and int(values.get("stRobotModbusStatus.uiAlarmCode", 0)) == 0
            and int(values.get("stRobotModbusStatus.uiExecutionState", 0)) == int(ExecutionState.IDLE)
        )

    @classmethod
    def fault_reset_complete(cls, values: dict[str, Any]) -> bool:
        if cls.robot_fault_active(values) or cls.cell_fault_active(values):
            return False
        return cls.robot_reset_complete(values)

    async def reset_robot_and_cell(self, socket: Any, *, robot_fault_expected: bool = False) -> None:
        """Reset latched robot and cell errors only after their physical causes are gone."""
        robot_fault = robot_fault_expected or self.robot_fault_active(self.values)
        cell_fault = self.cell_fault_active(self.values)
        cell_latch = bool(self.values.get("stCellStatus.xError", False))
        if not robot_fault and not cell_fault:
            return

        await self.ensure_manual_control(socket)
        await self.wait_value(
            socket,
            lambda values: not bool(values.get("xRobotReset", False))
            and not bool(values.get("xCellReset", False)),
            5.0,
            "previous Reset pulse did not return to zero",
        )
        if robot_fault:
            await self.wait_value(
                socket,
                lambda values: bool(values.get("stRobotStatus.xResetAllowed", False))
                and bool(values.get("stRobotHmiStatus.xResetAllowed", False)),
                20.0,
                "PLC did not allow robot Reset after the fault source was removed",
            )
        if robot_fault:
            await self.command(socket, "robot.reset")
            await self.wait_stable_value(
                socket,
                self.robot_reset_complete,
                30.0,
                "robot error did not reset completely",
                stable_for=0.5,
            )

        # A robot fault that occurred during an automatic cycle normally leaves a
        # separate FB_CELL_MANAGER latch. Reset it only after the robot is healthy:
        # before that point PLC may legitimately reject the general reset.
        cell_latch = cell_latch or bool(self.values.get("stCellStatus.xError", False))
        cell_fault = cell_latch or self.cell_fault_active(self.values)
        if cell_fault:
            await self.wait_value(
                socket,
                lambda values: bool(values.get("stCellStatus.xResetAllowed", False)),
                20.0,
                "PLC did not allow cell Reset after the robot error was cleared",
            )
            await self.command(socket, "cell.reset")
        await self.wait_stable_value(
            socket,
            self.fault_reset_complete,
            30.0,
            "robot and cell errors did not reset completely",
        )

    async def ensure_safety_home(self, socket: Any) -> None:
        """Use actual HOME tolerance feedback; eCurrentPoint may be stale after a stopped move."""
        if bool(self.values.get("stCellStatus.xRobotAtSafetyHome", False)):
            return
        await self.robot_action(
            socket,
            1,
            lambda values: bool(values.get("stCellStatus.xRobotAtSafetyHome", False)),
            point=13,
        )
        await self.wait_stable_value(
            socket,
            lambda values: bool(values.get("stCellStatus.xRobotAtSafetyHome", False)),
            10.0,
            "robot did not remain inside HOME_SAFETY tolerance",
            stable_for=0.4,
        )

    async def initialize_robot(self, socket: Any, initial_state: dict[str, Any]) -> None:
        await self.ensure_manual_control(socket)
        await self.ensure_safety_home(socket)
        grippers = initial_state["grippers"]
        await self.robot_action(
            socket,
            3 if int(grippers[0]["content"]) else 2,
            (lambda values: bool(values.get("stRobotStatus.xGripper1Closed", False)))
            if int(grippers[0]["content"])
            else (lambda values: bool(values.get("stRobotStatus.xGripper1Open", False))),
        )
        await self.robot_action(
            socket,
            5 if int(grippers[1]["content"]) else 4,
            (lambda values: bool(values.get("stRobotStatus.xGripper2Closed", False)))
            if int(grippers[1]["content"])
            else (lambda values: bool(values.get("stRobotStatus.xGripper2Open", False))),
        )
        detail_orientation = int(initial_state.get("orientation", 0)) == 1
        await self.robot_action(
            socket,
            7 if detail_orientation else 6,
            (lambda values: bool(values.get("stRobotStatus.xRotatedToDetail", False)))
            if detail_orientation
            else (lambda values: bool(values.get("stRobotStatus.xRotatedToBlank", False))),
        )

    @staticmethod
    def start_blockers(values: dict[str, Any]) -> list[str]:
        checks = (
            ("cell-idle", "stCellStatus.xStartCheckCellIdle"),
            ("automatic-mode", "stCellStatus.xStartCheckAutomaticMode"),
            ("no-blocking-error", "stCellStatus.xStartCheckNoBlockingError"),
            ("robot-interface", "stCellStatus.xStartCheckRobotInterfaceReady"),
            ("configuration", "stCellStatus.xStartCheckConfigurationValid"),
            ("drives", "stCellStatus.xStartCheckDrivesReady"),
            ("robot", "stCellStatus.xStartCheckRobotReady"),
            ("magazine", "stCellStatus.xStartCheckMagazineReady"),
            ("task", "stCellStatus.xStartCheckTaskAvailable"),
            ("safety-home", "stCellStatus.xStartCheckSafetyHome"),
        )
        return [label for label, symbol in checks if not bool(values.get(symbol, False))]

    async def enter_automatic_mode(self, socket: Any) -> None:
        await self.command(socket, "cell.manual", value=False)
        await self.wait_value(
            socket,
            lambda values: bool(values.get("stCellStatus.xStartCheckAutomaticMode", False)),
            15.0,
            "PLC did not enter automatic mode",
        )

    async def start_automatic_cycle(
        self, socket: Any, *, terminal_ack: Callable[[dict[str, Any]], bool] | None = None,
    ) -> None:
        """Start only when allowed and wait until PLC runs or asks a prestart question."""
        await self.enter_automatic_mode(socket)
        try:
            await self.wait_value(
                socket,
                lambda values: bool(values.get("stCellStatus.xStartAllowed", False)),
                20.0,
                "PLC start conditions did not become ready",
            )
        except TimeoutError as error:
            blockers = ", ".join(self.start_blockers(self.values)) or "unknown"
            raise AssertionError(f"PLC start is blocked by: {blockers}") from error
        await self.command(socket, "cell.start")
        # Без этого ACK быстрый runner мог принять старую observability прошлого
        # кейса, объявить PASS и уйти в recovery раньше, чем PLC увидел Start.
        await self.wait_value(
            socket,
            lambda values: bool(values.get("stCellStatus.xRunning", False))
            or bool(values.get("stCellStatus.xOperatorPromptActive", False))
            or (terminal_ack is not None and terminal_ack(values)),
            10.0,
            "PLC did not acknowledge automatic cycle start",
        )

    async def set_test_speed_profile(
        self,
        socket: Any,
        profile: int,
        *,
        timeout: float,
        label: str,
    ) -> None:
        """Change the PLC test speed only after the previous pulse and activity settle."""
        await self.wait_value(
            socket,
            lambda values: not bool(values.get("xTestSpeedProfileApply", False)),
            5.0,
            "previous test speed pulse did not return to zero",
        )
        await self.command(socket, "test.speed.set", value=profile)
        await self.wait_value(
            socket,
            lambda values: int(values.get("uiTestSpeedProfileApplied", -1)) == profile,
            timeout,
            label,
        )
        await self.wait_value(
            socket,
            lambda values: not bool(values.get("xTestSpeedProfileApply", False)),
            5.0,
            "test speed pulse did not return to zero",
        )

    async def wait_softmotion_acceleration(
        self, socket: Any, expected_factor: int, timeout: float,
    ) -> None:
        await self.wait_value(
            socket,
            lambda values: bool(values.get("xSimulationAccelerationError", False))
            or (
                not bool(values.get("xSimulationAccelerationBusy", False))
                and bool(values.get("xSimulationAccelerationActive", False))
                == (expected_factor > 1)
                and int(values.get("uiSimulationTimeFactorApplied", 0)) == expected_factor
            ),
            timeout,
            "SoftMotion dynamic limits were not applied before the test",
        )
        if bool(self.values.get("xSimulationAccelerationError", False)):
            error_id = int(self.values.get("udiSimulationAccelerationErrorId", 0))
            raise RuntimeError(f"PLC could not apply SoftMotion dynamic limits: {error_id:#x}")

    async def restore_test_environment(self, socket: Any) -> None:
        """Restore the pre-run environment only after all equipment becomes stable."""
        await self.wait_value(
            socket,
            lambda values: bool(values.get("xTestEnvironmentChangeAllowed", False)),
            90.0,
            "PLC did not allow restoring the initial test environment",
        )
        await self.command(socket, "test.environment.set", value=self._initial_environment)
        await self.wait_value(
            socket,
            lambda values: int(values.get("uiTestEnvironmentApplied", -1))
            == self._initial_environment,
            15.0,
            "test environment did not return to its initial value",
        )
        if (
            not bool(self.values.get("xModbusMode", False))
            and self._initial_environment != 1
        ):
            await self.wait_softmotion_acceleration(socket, 1, 90.0)

    async def answer_operator_prompts(self, socket: Any, initial_state: dict[str, Any]) -> None:
        """Answer only the active PLC-owned prestart prompt, then wait for its acknowledgement."""
        answered = 0
        deadline = time.monotonic() + 45.0
        while time.monotonic() < deadline:
            if not bool(self.values.get("stCellStatus.xOperatorPromptActive", False)):
                if answered:
                    return
                await self.wait_value(
                    socket,
                    lambda values: bool(values.get("stCellStatus.xOperatorPromptActive", False)),
                    15.0,
                    "PLC did not open the expected operator prompt",
                )
            prompt = int(self.values.get("stCellStatus.uiOperatorPrompt", 0))
            if prompt == 1:
                choice = 1  # gripper 1 contains a blank
            elif prompt == 2:
                choice = int(initial_state["grippers"][0]["productType"])
            elif prompt == 3:
                choice = 2  # gripper 2 contains a finished detail
            elif prompt == 4:
                choice = int(initial_state["grippers"][1]["productType"])
            elif prompt == 5:
                mask = int(self.values.get("stCellStatus.uiOperatorMachineMask", 0))
                choice = next((index for index in range(1, 4) if mask & (1 << (index - 1))), 0)
            else:
                raise AssertionError(f"unknown PLC operator prompt {prompt}")
            if choice <= 0:
                raise AssertionError(f"operator prompt {prompt} has no valid scenario answer")
            await self.command(socket, "cell.operatorChoice", value=choice)
            await self.wait_value(
                socket,
                lambda values: not bool(values.get("stCellStatus.xOperatorPromptActive", False))
                or int(values.get("stCellStatus.uiOperatorPrompt", 0)) != prompt,
                15.0,
                f"PLC did not accept operator answer for prompt {prompt}",
            )
            # Gateway holds xCellOperatorChoice for 150 ms. The PLC can expose
            # the next question earlier, so leave enough time for the previous
            # pulse to return to zero before creating the next rising edge.
            await asyncio.sleep(0.2)
            answered += 1
        raise TimeoutError("operator prompt sequence did not finish")

    @staticmethod
    def decision_matches(expected: str, values: dict[str, Any]) -> bool:
        magazine_operation = int(values.get("stTestObservability.uiMagazineOperation", 0))
        machine_operations = [
            int(values.get(f"stTestObservability.auiMachineOperation[{index}]", 0))
            for index in range(1, 4)
        ]
        if expected == "magazine-take":
            return magazine_operation == 2
        if expected == "magazine-put":
            return magazine_operation == 1
        if expected == "magazine-change":
            return magazine_operation == 3
        if expected == "return-blank":
            return magazine_operation == 4
        if expected == "held-blank-wait":
            return (
                bool(values.get("stCellStatus.xRunning", False))
                and int(values.get("stTestObservability.uiCellState", -1)) == 9  # WAIT_MAGAZINE
                and int(values.get("stTestObservability.uiSelectedMachine", -1)) == 0
                and bool(values.get("stRobotStatus.xBlankAvailable", False))
                and not bool(values.get("stRobotStatus.xDetailAvailable", False))
                and not bool(values.get("stRobotStatus.xBusy", False))
                and int(values.get("stTestObservability.uiRobotAction", 0)) == 0
                and magazine_operation == 0
                and not any(machine_operations)
            )
        if expected == "machine-change":
            return 3 in machine_operations
        if expected == "machine-unload":
            return 2 in machine_operations
        if expected == "machine-load":
            return 1 in machine_operations
        if expected == "operator-type-choice":
            return bool(values.get("stCellStatus.xOperatorPromptActive", False))
        if expected == "no-task":
            return not bool(values.get("stCellStatus.xStartCheckTaskAvailable", True))
        if expected == "geometry-delivery":
            for machine in (1, 2, 3):
                station = values.get(f"astGeometryCalls[{machine}].uiStation")
                if (values.get(f"astGeometryCalls[{machine}].uiState") == 4 and station in (1, 2)
                        and values.get(f"astGeometryStatus[{station}].xOccupied", False)):
                    return True
            return False
        if expected not in ("cycle-completes", "safe-stop", "robot-error-reset"):
            return False
        return (
            int(values.get("stTestObservability.uiRobotAction", 0)) != 0
            or magazine_operation != 0
            or any(machine_operations)
        )

    @staticmethod
    def initial_inventory(initial_state: dict[str, Any]) -> dict[int, int]:
        counts = {1: 0, 2: 0, 3: 0}
        magazines = initial_state.get("magazines")
        if not isinstance(magazines, list):
            magazines = [{"slots": initial_state.get("slots", [])}]
        for magazine in magazines:
            for slot in magazine["slots"] + magazine.get("operatorSlots", []):
                if int(slot["content"]):
                    counts[int(slot["productType"])] += 1
        for machine in initial_state["machines"]:
            if int(machine["state"]) in (2, 3):
                counts[int(machine["productType"])] += 1
        for gripper in initial_state["grippers"]:
            if int(gripper["content"]):
                counts[int(gripper["productType"])] += 1
        return counts

    @staticmethod
    def observed_inventory(values: dict[str, Any]) -> dict[int, int]:
        counts = {1: 0, 2: 0, 3: 0}
        mode = values.get("uiMagazineMode", 0)
        roots = ([f"astTwinStore[{m}].astPallet[{p}]" for m in (1, 2) for p in (1, 2)]
                 if mode == 1 else [f"astMagazineInventory[{m}]" for m in (1, 2)])
        for owner in roots:
            for index in range(1, 97 if mode == 1 else 121):
                root = f"{owner}.aSlots[{index}]"
                if bool(values.get(f"{root}.xInPosition", False)):
                    product_type = int(values.get(f"{root}.uiProductType", 0))
                    if product_type not in counts:
                        raise AssertionError(f"occupied slot has unknown product type: {root}")
                    counts[product_type] += 1
        for station in (1, 2):
            if values.get(f"astGeometryStatus[{station}].xOccupied", False):
                product_type = int(values.get(f"astGeometryStatus[{station}].uiProductType", 0))
                if product_type not in counts:
                    raise AssertionError(f"GK {station}: occupied station has unknown product type")
                counts[product_type] += 1
        for index in range(1, 4):
            if int(values.get(f"astMachineStatus[{index}].ePartType", 0)) != 0:
                product_type = int(values.get(f"stMultiType.Config.auiMachineType[{index}]", 0))
                if product_type in counts:
                    counts[product_type] += 1
        if bool(values.get("stRobotStatus.xGripper1Closed", False)):
            product_type = int(values.get("stRobotStatus.uiBlankPayloadType", 0))
            if product_type in counts:
                counts[product_type] += 1
        if bool(values.get("stRobotStatus.xGripper2Closed", False)):
            product_type = int(values.get("stRobotStatus.uiDetailPayloadType", 0))
            if product_type in counts:
                counts[product_type] += 1
        return counts

    @staticmethod
    def setup_differences(state: dict[str, Any], values: dict[str, Any]) -> list[str]:
        differences = []
        for m, magazine in enumerate(state["magazines"], 1):
            if state.get("magazineMode", 0) == 1:
                role = values.get(f"astTwinStatus[{m}].uiRobotPallet")
                if role not in (1, 2):
                    differences.append(f"magazine {m}: unknown physical pallet role")
                    continue
                owners = [(f"astTwinStore[{m}].astPallet[{role}]", magazine["slots"]),
                          (f"astTwinStore[{m}].astPallet[{3 - role}]", magazine["operatorSlots"])]
            else:
                owners = [(f"astMagazineInventory[{m}]", magazine["slots"])]
            for owner, slots in owners:
                for index, slot in enumerate(slots, 1):
                    root = f"{owner}.aSlots[{index}]"
                    expected = (bool(slot["content"]), slot["content"], slot["productType"] if slot["content"] else 0)
                    actual = (values.get(f"{root}.xInPosition"), values.get(f"{root}.eDetailType"), values.get(f"{root}.uiProductType"))
                    if actual != expected:
                        differences.append(f"{root}: expected={expected}, actual={actual}")
        for i, machine in enumerate(state["machines"], 1):
            part_type = {0: 0, 1: 0, 2: 2, 3: 1}[machine["state"]]
            if values.get(f"astMachineStatus[{i}].xEnabled") != (machine["state"] != 0) or values.get(f"astMachineStatus[{i}].ePartType") != part_type:
                differences.append(f"machine {i}: initial state {machine['state']} not applied (check base points)")
        return differences

    @staticmethod
    def magazine_inventory_counts(values: dict[str, Any], magazine: int) -> tuple[int, int, int]:
        """Return BLANK, DETAIL and invalid occupied slot counts for one magazine."""
        blanks = 0
        details = 0
        invalid = 0
        for index in range(1, 121):
            root = f"astMagazineInventory[{magazine}].aSlots[{index}]"
            if not bool(values.get(f"{root}.xInPosition", False)):
                continue
            content = int(values.get(f"{root}.eDetailType", 0))
            product_type = int(values.get(f"{root}.uiProductType", 0))
            if content == 1 and product_type == 1:
                blanks += 1
            elif content == 2 and product_type == 1:
                details += 1
            else:
                invalid += 1
        return blanks, details, invalid

    @classmethod
    def general_progress_signature(cls, values: dict[str, Any]) -> tuple[Any, ...]:
        """Only physical/technological changes reset the long-cycle stall watchdog."""
        return (
            int(values.get("stCellStatus.uiActiveMagazine", 0)),
            int(values.get("astMagazineStatus[1].udiProducedPartsTotal", 0)),
            int(values.get("astMagazineStatus[2].udiProducedPartsTotal", 0)),
            cls.magazine_inventory_counts(values, 1),
            cls.magazine_inventory_counts(values, 2),
            bool(values.get("stRobotStatus.xGripper1Closed", False)),
            bool(values.get("stRobotStatus.xGripper2Closed", False)),
            *(
                item
                for index in range(1, 4)
                for item in (
                    int(values.get(f"astMachineStatus[{index}].ePartType", 0)),
                    bool(values.get(f"astMachineStatus[{index}].xProcessing", False)),
                )
            ),
        )

    @staticmethod
    def general_batch_state_valid(
        values: dict[str, Any],
        magazine: int,
        next_magazine: int,
        produced_at_start: int,
        target: int,
    ) -> bool:
        """Allow the PLC publication scan between magazine handover and Finished."""
        produced = int(values.get(
            f"astMagazineStatus[{magazine}].udiProducedPartsTotal", 0,
        )) - produced_at_start
        active_magazine = int(values.get("stCellStatus.uiActiveMagazine", 0))
        return (
            0 <= produced <= target
            and active_magazine in (magazine, next_magazine)
            and (active_magazine == magazine or produced == target)
        )

    async def wait_general_condition(
        self,
        socket: Any,
        predicate: Callable[[dict[str, Any]], bool],
        label: str,
        *,
        warning_baseline: int,
        allow_stopped: bool = False,
        invariant: Callable[[dict[str, Any]], bool] | None = None,
    ) -> None:
        """Wait for a long production phase while failing on a real lack of progress."""
        if invariant is not None and not invariant(self.values):
            raise AssertionError(f"{label}: invalid initial phase state")
        if predicate(self.values):
            return
        factor = max(1, int(self.simulation_factor))
        stall_timeout = max(90.0, 900.0 / factor)
        phase_timeout = max(1800.0, 14400.0 / factor)
        phase_deadline = time.monotonic() + phase_timeout
        signature = self.general_progress_signature(self.values)

        while time.monotonic() < phase_deadline:
            def changed_or_terminal(_message: dict[str, Any], values: dict[str, Any]) -> bool:
                return (
                    predicate(values)
                    or self.general_progress_signature(values) != signature
                    or bool(values.get("xGlobalError", False))
                    or bool(values.get("stCellStatus.xError", False))
                    or int(values.get("stTestObservability.uiErrorSource", 0)) != 0
                    or int(values.get("stAlarmStatus.uiActiveAlarmCount", 0)) != 0
                    or int(values.get("stAlarmStatus.uiActiveWarningCount", 0)) > warning_baseline
                    or (not allow_stopped and not bool(values.get("stCellStatus.xRunning", False)))
                    or (invariant is not None and not invariant(values))
                )

            remaining = phase_deadline - time.monotonic()
            await self.wait_for(
                socket,
                changed_or_terminal,
                min(stall_timeout, remaining),
                f"{label}: no technological progress",
            )
            if bool(self.values.get("xGlobalError", False)) or bool(
                self.values.get("stCellStatus.xError", False)
            ) or int(self.values.get("stTestObservability.uiErrorSource", 0)) != 0 or int(
                self.values.get("stAlarmStatus.uiActiveAlarmCount", 0)
            ) != 0:
                raise AssertionError(
                    f"{label}: PLC error source="
                    f"{self.values.get('stTestObservability.uiErrorSource', 0)} code="
                    f"{self.values.get('stTestObservability.dwErrorCode', 0)}"
                )
            warnings = int(self.values.get("stAlarmStatus.uiActiveWarningCount", 0))
            if warnings > warning_baseline:
                raise AssertionError(f"{label}: PLC created an unexpected warning ({warnings})")
            if invariant is not None and not invariant(self.values):
                raise AssertionError(f"{label}: magazine sequence or batch counter is invalid")
            if predicate(self.values):
                return
            if not allow_stopped and not bool(self.values.get("stCellStatus.xRunning", False)):
                raise AssertionError(f"{label}: automatic cycle stopped before the batch completed")
            signature = self.general_progress_signature(self.values)
        raise TimeoutError(f"{label}: phase timeout")

    async def reload_general_magazine(
        self,
        socket: Any,
        magazine: int,
        *,
        active_magazine: int,
        warning_baseline: int,
    ) -> None:
        """Emulate operator Clear -> Fill -> Enable without stopping the running cell."""
        root = f"astMagazineStatus[{magazine}]"
        if int(self.values.get("stCellStatus.uiActiveMagazine", 0)) != active_magazine:
            raise AssertionError(
                f"magazine {magazine} reload started outside magazine {active_magazine} processing"
            )
        await self.wait_general_condition(
            socket,
            lambda values: bool(values.get(f"{root}.xFinished", False))
            and bool(values.get(f"{root}.xClearAllowed", False)),
            f"magazine {magazine} did not become editable",
            warning_baseline=warning_baseline,
        )
        if self.magazine_inventory_counts(self.values, magazine) != (0, 120, 0):
            raise AssertionError(
                f"magazine {magazine} is not a completed 120-detail batch before reload: "
                f"{self.magazine_inventory_counts(self.values, magazine)}"
            )

        await self.command(socket, "magazine.clear", magazine=magazine)
        await self.wait_value(
            socket,
            lambda values: self.magazine_inventory_counts(values, magazine) == (0, 0, 0),
            15.0,
            f"magazine {magazine} did not clear",
        )
        await self.wait_value(
            socket,
            lambda values: bool(values.get(f"{root}.xFillAllowed", False)),
            10.0,
            f"magazine {magazine} does not allow filling",
        )
        await self.command(socket, "magazine.fill", magazine=magazine)
        await self.wait_value(
            socket,
            lambda values: self.magazine_inventory_counts(values, magazine) == (120, 0, 0),
            15.0,
            f"magazine {magazine} did not fill with 120 type-1 blanks",
        )
        await self.wait_value(
            socket,
            lambda values: bool(values.get(f"{root}.xEnableSequenceAllowed", False)),
            20.0,
            f"magazine {magazine} does not allow Enable after reload",
        )
        await self.command(socket, "magazine.enable", magazine=magazine)
        await self.wait_value(
            socket,
            lambda values: bool(values.get(f"{root}.xEnabled", False))
            and bool(values.get(f"{root}.xReady", False))
            and not bool(values.get(f"{root}.xFinished", True)),
            20.0,
            f"magazine {magazine} did not return to automatic service",
        )
        if int(self.values.get("stCellStatus.uiActiveMagazine", 0)) != active_magazine:
            raise AssertionError(
                f"cell left magazine {active_magazine} while magazine {magazine} was reloaded"
            )

    async def prepare_general_cycle(self, socket: Any) -> None:
        """Make the first magazine deterministic without changing the test inventory."""
        if int(self.values.get("stAlarmStatus.uiActiveWarningCount", 0)):
            await self.command(socket, "alarms.resetWarnings")
            await self.wait_value(
                socket,
                lambda values: int(values.get("stAlarmStatus.uiActiveWarningCount", 0)) == 0,
                10.0,
                "old PLC warnings did not reset before the general test",
            )

        if int(self.values.get("stCellStatus.uiActiveMagazine", 0)) != 1:
            if bool(self.values.get("astMagazineStatus[2].xEnabled", False)):
                await self.command(socket, "magazine.disable", magazine=2)
                await self.wait_value(
                    socket,
                    lambda values: not bool(values.get("astMagazineStatus[2].xEnabled", True))
                    and int(values.get("stCellStatus.uiActiveMagazine", 0)) == 1,
                    20.0,
                    "PLC did not select magazine 1 for the general test",
                )
            else:
                await self.wait_value(
                    socket,
                    lambda values: int(values.get("stCellStatus.uiActiveMagazine", 0)) == 1,
                    10.0,
                    "PLC did not select available magazine 1 for the general test",
                )
            await self.wait_value(
                socket,
                lambda values: bool(values.get(
                    "astMagazineStatus[2].xEnableSequenceAllowed", False,
                )),
                20.0,
                "magazine 2 could not be re-enabled before the general test",
            )
            await self.command(socket, "magazine.enable", magazine=2)
            await self.wait_value(
                socket,
                lambda values: bool(values.get("astMagazineStatus[2].xEnabled", False))
                and bool(values.get("astMagazineStatus[2].xReady", False))
                and int(values.get("stCellStatus.uiActiveMagazine", 0)) == 1,
                20.0,
                "magazine 2 did not become ready while magazine 1 kept priority",
            )

        if not (
            bool(self.values.get("astMagazineStatus[1].xEnabled", False))
            and bool(self.values.get("astMagazineStatus[1].xReady", False))
            and bool(self.values.get("astMagazineStatus[2].xEnabled", False))
            and bool(self.values.get("astMagazineStatus[2].xReady", False))
        ):
            raise AssertionError("both magazines are not ready before the general test")

    async def run_general_cycle(
        self,
        socket: Any,
        case: dict[str, Any],
        index: int,
        total: int,
        initial_counts: dict[int, int],
    ) -> None:
        batch_size = int(case.get("expectations", {}).get("batchSize", 120))
        initial_loaded = int(
            case.get("expectations", {}).get("initialLoadedMachineCount", 0)
        )
        produced_at_start = {
            magazine: int(
                self.values.get(f"astMagazineStatus[{magazine}].udiProducedPartsTotal", 0)
            )
            for magazine in (1, 2)
        }
        warning_baseline = 0
        warning_count = int(self.values.get("stAlarmStatus.uiActiveWarningCount", 0))
        if warning_count:
            raise AssertionError(
                f"general test started with {warning_count} active PLC warnings"
            )

        async def wait_batch(
            magazine: int,
            batch_number: int,
            next_magazine: int,
            stage: str,
        ) -> None:
            target = batch_size * batch_number
            await self.send(socket, {
                "type": "test-progress", "caseIndex": index, "caseCount": total,
                "stage": stage, "name": case["name"],
            })
            await self.wait_general_condition(
                socket,
                lambda values: (
                    int(values.get(
                        f"astMagazineStatus[{magazine}].udiProducedPartsTotal", 0,
                    )) - produced_at_start[magazine] == target
                    and bool(values.get(f"astMagazineStatus[{magazine}].xFinished", False))
                    and bool(values.get(f"astMagazineStatus[{magazine}].xEditAllowed", False))
                    and int(values.get("stCellStatus.uiActiveMagazine", 0)) == next_magazine
                ),
                f"magazine {magazine} batch {batch_number}",
                warning_baseline=warning_baseline,
                invariant=lambda values: self.general_batch_state_valid(
                    values,
                    magazine,
                    next_magazine,
                    produced_at_start[magazine],
                    target,
                ),
            )
            if self.magazine_inventory_counts(self.values, magazine) != (0, batch_size, 0):
                raise AssertionError(
                    f"magazine {magazine} batch {batch_number} finished with invalid inventory: "
                    f"{self.magazine_inventory_counts(self.values, magazine)}"
                )

        await wait_batch(1, 1, 2, "general-m1-a")
        await self.send(socket, {
            "type": "test-progress", "caseIndex": index, "caseCount": total,
            "stage": "general-reload-m1", "name": case["name"],
        })
        await self.reload_general_magazine(
            socket, 1, active_magazine=2, warning_baseline=warning_baseline,
        )

        await wait_batch(2, 1, 1, "general-m2-a")
        await self.send(socket, {
            "type": "test-progress", "caseIndex": index, "caseCount": total,
            "stage": "general-reload-m2", "name": case["name"],
        })
        await self.reload_general_magazine(
            socket, 2, active_magazine=1, warning_baseline=warning_baseline,
        )

        await wait_batch(1, 2, 2, "general-m1-b")
        await self.send(socket, {
            "type": "test-progress", "caseIndex": index, "caseCount": total,
            "stage": "general-m2-b", "name": case["name"],
        })
        await self.wait_general_condition(
            socket,
            lambda values: (
                int(values.get("astMagazineStatus[2].udiProducedPartsTotal", 0))
                - produced_at_start[2] == batch_size * 2
                and bool(values.get("astMagazineStatus[2].xFinished", False))
                and not bool(values.get("stCellStatus.xRunning", True))
                and not bool(values.get("stRobotStatus.xGripper1Closed", True))
                and not bool(values.get("stRobotStatus.xGripper2Closed", True))
                and all(
                    not bool(values.get(f"astMachineStatus[{machine}].xProcessing", False))
                    for machine in range(1, 4)
                )
            ),
            "magazine 2 batch 2 and final cell state",
            warning_baseline=warning_baseline,
            allow_stopped=True,
            invariant=lambda values: (
                int(values.get("stCellStatus.uiActiveMagazine", 0)) in (0, 2)
                and (
                    int(values.get("stCellStatus.uiActiveMagazine", 0)) == 2
                    or (
                        int(values.get("astMagazineStatus[2].udiProducedPartsTotal", 0))
                        - produced_at_start[2] == batch_size * 2
                        and bool(values.get("astMagazineStatus[2].xFinished", False))
                    )
                )
            ),
        )

        for magazine in (1, 2):
            if self.magazine_inventory_counts(self.values, magazine) != (0, batch_size, 0):
                raise AssertionError(
                    f"final magazine {magazine} inventory is invalid: "
                    f"{self.magazine_inventory_counts(self.values, magazine)}"
                )
            produced = int(
                self.values.get(f"astMagazineStatus[{magazine}].udiProducedPartsTotal", 0)
            ) - produced_at_start[magazine]
            if produced != batch_size * 2:
                raise AssertionError(
                    f"magazine {magazine} produced {produced}, expected {batch_size * 2}"
                )
        loaded_part_types = [
            int(self.values.get(f"astMachineStatus[{machine}].ePartType", 0))
            for machine in range(1, 4)
            if int(self.values.get(f"astMachineStatus[{machine}].ePartType", 0)) != 0
        ]
        if len(loaded_part_types) != initial_loaded or any(
            part_type != 1 for part_type in loaded_part_types
        ):
            raise AssertionError(
                f"final machine WIP is invalid: types={loaded_part_types}, "
                f"expected {initial_loaded} finished details"
            )
        observed_counts = self.observed_inventory(self.values)
        if observed_counts != initial_counts:
            raise AssertionError(
                f"general-cycle inventory balance changed: initial={initial_counts}, "
                f"observed={observed_counts}"
            )

    async def apply_scenario(self, socket: Any, case: dict[str, Any]) -> bool:
        self.require_magazine_mode(self.values, int(case["initialState"].get("magazineMode", 0)))
        expected_rejection = bool(case.get("expectations", {}).get("applyRejected"))
        previous_inventory = self.observed_inventory(self.values) if expected_rejection else None
        validation_errors = validate_inventory(case["initialState"])
        if validation_errors and not expected_rejection:
            raise ValueError("; ".join(validation_errors))
        if not validation_errors and expected_rejection:
            raise ValueError("scenario marked rejected is valid according to the independent oracle")

        await self.clear_fault_sources(socket)
        await asyncio.sleep(0.2)

        # Loading writes more than 150 OPC UA values and ends with a pulse. A
        # second synchronization load can follow almost immediately when the
        # robot feedback already matches the scenario. Wait for both the falling
        # edge and PLC-owned permission; otherwise a valid buffer is rejected as
        # "equipment busy" (result 1). One retry also covers a pulse missed by the
        # OPC UA/PLC boundary without changing the tested initial state.
        last_error: Exception | None = None
        for attempt in range(2):
            await self.wait_value(
                socket,
                lambda values: not bool(values.get("xTestScenarioApply", False)),
                5.0,
                "previous scenario Apply pulse did not return to zero",
            )
            await self.wait_value(
                socket,
                lambda values: bool(values.get("xTestScenarioApplyAllowed", False)),
                30.0,
                "PLC does not allow applying the test scenario",
            )

            previous_load = int(self.values.get("stTestScenario.udiLoadSeq", 0))
            requested_factor = int(self.values.get("uiSimulationTimeFactor", 1))
            await self.command(socket, "test.scenario.apply", scenario=case["initialState"])
            try:
                await self.wait_for(
                    socket,
                    lambda _message, values: (
                        int(values.get("stTestScenario.udiLoadSeq", 0)) not in (0, previous_load)
                        and int(values.get("udiTestScenarioAckSeq", 0))
                        == int(values.get("stTestScenario.udiLoadSeq", 0))
                    ),
                    20.0,
                    "PLC did not acknowledge scenario LoadSeq",
                )
            except TimeoutError as error:
                last_error = error
                if attempt == 0:
                    continue
                raise

            result = int(self.values.get("uiTestScenarioResult", 255))
            if (
                result == 0
                and self.robot_interface == "softmotion"
                and self.environment == "simulation"
            ):
                expected_factor = requested_factor if self.speed_profile == "fast" else 1
                await self.wait_softmotion_acceleration(socket, expected_factor, 90.0)
            await self.wait_value(
                socket,
                lambda values: not bool(values.get("xTestScenarioApply", False)),
                5.0,
                "scenario Apply pulse did not return to zero",
            )
            if result == 1 and attempt == 0:
                last_error = AssertionError("PLC rejected scenario while equipment was not stable")
                continue
            if expected_rejection:
                if result != 2:
                    raise AssertionError(f"PLC scenario validation result is {result}, expected 2")
                self.check("PLC отклонил некорректный сценарий", 2, result)
                self.check("Отклонённая загрузка сохранила баланс", previous_inventory, self.observed_inventory(self.values))
                self.check("Отклонённый сценарий не запущен", False, bool(self.values.get("stCellStatus.xRunning", False)))
                return False
            if result != 0:
                raise AssertionError(f"PLC rejected a valid scenario, result={result}")
            self.check("Подтверждение LoadSeq", int(self.values.get("stTestScenario.udiLoadSeq", 0)), int(self.values.get("udiTestScenarioAckSeq", 0)))
            return True

        assert last_error is not None
        raise last_error

    async def exercise_robot_error_reset(self, socket: Any) -> None:
        if self._simulator_session_acquired:
            # FAST can finish a move before OPC UA reports Busy back to the
            # runner. Start watching the simulator before issuing the PLC
            # command, then inject while its model is actually moving.
            async def inject_during_motion() -> None:
                deadline = time.monotonic() + 5.0
                while time.monotonic() < deadline:
                    health = await asyncio.to_thread(self.simulator_control.health)
                    execution_state = int(health.get("robot", {}).get("executionState", -1))
                    if execution_state == int(ExecutionState.BUSY):
                        await asyncio.to_thread(
                            self.simulator_control.set_fault, "motion_fault", True,
                        )
                        return
                    await asyncio.sleep(0.005)
                raise TimeoutError("robot did not start the movement used for fault injection")

            injection_task = asyncio.create_task(inject_during_motion())
            try:
                await self.begin_robot_action(socket, 1, point=1)
                await injection_task
            except Exception:
                injection_task.cancel()
                with suppress(asyncio.CancelledError):
                    await injection_task
                raise
        else:
            await self.command(socket, "fault.enable", value=True)
            await self.command(socket, "fault.robotWrongAction")
        await self.wait_value(
            socket, lambda values: int(values.get("stTestObservability.uiErrorSource", 0)) == 2,
            15.0, "robot fault was not attributed to the robot",
        )
        self.check("Инъекция аварии принадлежит роботу", 2, int(self.values.get("stTestObservability.uiErrorSource", 0)))
        await self.clear_fault_sources(socket)
        await self.reset_robot_and_cell(socket, robot_fault_expected=True)
        self.check("Авария робота сброшена", False, self.robot_fault_active(self.values))
        await self.ensure_safety_home(socket)

    async def verify_initial_error(self, socket: Any, case: dict[str, Any], expected_source: int) -> None:
        if expected_source == 2 and self._simulator_session_acquired:
            await asyncio.to_thread(self.simulator_control.set_fault, "motion_fault", True)
        await self.wait_value(
            socket,
            lambda values: int(values.get("stTestObservability.uiErrorSource", 0)) == expected_source,
            20.0,
            f"fault owner is not source {expected_source}",
        )
        self.check("Первичный владелец ошибки", expected_source, int(self.values.get("stTestObservability.uiErrorSource", 0)))
        await self.clear_fault_sources(socket)
        await self.reset_robot_and_cell(socket, robot_fault_expected=expected_source == 2)
        await self.ensure_safety_home(socket)

    async def clear_fault_sources(self, socket: Any) -> None:
        await self.command(socket, "test.faults.clear")
        if not self._simulator_session_acquired:
            return
        await asyncio.to_thread(self.simulator_control.clear)

    async def stop_geometry(self, socket: Any) -> None:
        if self.environment != "simulation" or self.robot_interface != "softmotion":
            return
        for station in (1, 2):
            root = f"astGeometryStatus[{station}]"
            if self.values.get(f"{root}.xEnabled") or self.values.get(f"{root}.xDriveRunning"):
                await self.command(socket, "geometry.command", action=6, magazine=station)
        await self.wait_value(socket, lambda v: all(not v.get(f"astGeometryStatus[{i}].xDriveRunning", False)
                                                   and not v.get(f"astGeometryStatus[{i}].xReserved", False) for i in (1, 2)),
                              45.0, "GK transport did not stop before scenario reset")

    async def initialize_geometry(self, socket: Any, case: dict[str, Any]) -> None:
        for station, enabled in enumerate(case["initialState"].get("geometry", {}).get("enabled", [False, False]), 1):
            if not enabled:
                continue
            root = f"astGeometryStatus[{station}]"
            await self.wait_value(socket, lambda v: bool(v.get(f"{root}.xConfirmAllowed")), 10.0,
                                  f"GK {station}: virtual empty belt confirmation is not allowed")
            await self.command(socket, "geometry.command", action=3, magazine=station)
            await self.wait_value(socket, lambda v: bool(v.get(f"{root}.xEnableAllowed")), 10.0,
                                  f"GK {station}: enable is blocked (check configured base and PLC blockers)")
            await self.command(socket, "geometry.command", action=1, magazine=station)
            await self.wait_value(socket, lambda v: bool(v.get(f"{root}.xReady")), 10.0, f"GK {station}: not ready")

    def check(self, label: str, expected: Any, actual: Any) -> None:
        record = {"label": label, "expected": expected, "actual": actual, "passed": expected == actual}
        if not hasattr(self, "case_checks"):
            self.case_checks = []
        self.case_checks.append(record)
        if not record["passed"]:
            raise AssertionError(f"{label}: expected={expected}, actual={actual}")

    def case_diagnostics(self, case: dict[str, Any]) -> dict[str, Any]:
        keys = ["uiMagazineMode", "stTestObservability.uiSchemaVersion", "stTestObservability.uiCellState",
                "stTestObservability.uiActiveMagazine", "stTestObservability.uiReturnMagazine",
                "stTestObservability.uiSelectedMachine", "stTestObservability.uiSelectedType",
                "stTestObservability.uiMagazineOperation", "stTestObservability.uiRobotAction",
                "stTestObservability.uiErrorSource", "stTestObservability.dwErrorCode",
                "stTestScenario.udiLoadSeq", "udiTestScenarioAckSeq", "uiTestScenarioResult",
                "auiRobotModbusWriteRegisters[8]", "stRobotModbusStatus.uiAckSeq",
                "auiRobotModbusWriteRegisters[1]", "auiRobotModbusWriteRegisters[2]",
                "auiRobotModbusWriteRegisters[3]", "auiRobotModbusWriteRegisters[9]",
                "stRobotModbusStatus.uiExecutionState", "stRobotModbusStatus.uiResultCode"]
        keys += [f"astGeometryCalls[{i}].{field}" for i in (1, 2, 3) for field in ("udiId", "uiState", "uiStation", "uiMagazine", "uiPallet", "uiSlot", "uiReason")]
        return {"expectations": case.get("expectations", {}), "checks": getattr(self, "case_checks", []),
                "observed": {k: self.values[k] for k in keys if k in self.values}}

    async def recover_between_cases(self, socket: Any) -> None:
        try:
            await self.stop_cell_if_running(socket)
            await self.clear_fault_sources(socket)
            await self.wait_value(
                socket,
                lambda values: not bool(values.get("stCellStatus.xRunning", False))
                and not bool(values.get("stRobotStatus.xBusy", False)),
                45.0,
                "previous test activity did not stop",
            )
            await self.ensure_manual_control(socket)
            await self.reset_robot_and_cell(socket)
            await self.wait_stable_value(
                socket,
                lambda values: not bool(values.get("stCellStatus.xRunning", False))
                and not bool(values.get("stRobotStatus.xBusy", False))
                and self.fault_reset_complete(values),
                45.0,
                "previous test case did not return to a clean idle state",
            )
            await self.ensure_softmotion_drives(socket)
            await self.ensure_safety_home(socket)
            await self.stop_geometry(socket)
            await self.wait_value(
                socket,
                lambda values: bool(values.get("xTestScenarioApplyAllowed", False)),
                90.0 if self.speed_profile == "realtime" else 30.0,
                "PLC does not allow applying the next test scenario",
            )
        except RunAborted:
            raise
        except Exception as error:
            raise RecoveryError(str(error)) from error

    async def run_case(self, socket: Any, case: dict[str, Any], index: int, total: int) -> None:
        self.case_checks = []
        self._recovery_stage = None
        await self.send(socket, {
            "type": "test-progress", "caseIndex": index, "caseCount": total,
            "stage": "load", "name": case["name"],
        })
        await self.recover_between_cases(socket)
        if not await self.apply_scenario(socket, case):
            return

        expected_error_source = int(
            case.get("expectations", {}).get("expectedErrorSource", 0)
            or expected_error_owner(case["initialState"])
        )
        if expected_error_source:
            await self.verify_initial_error(socket, case, expected_error_source)
            return

        await self.initialize_robot(socket, case["initialState"])
        # The first load supplies payload type metadata before gripper commands.
        # Load the same scenario once more after the physical feedback is correct:
        # otherwise FB_MAGAZINE can legitimately auto-disable while the robot still
        # reflects the previous case (notably an empty magazine plus a held part).
        if not await self.apply_scenario(socket, case):
            raise AssertionError("valid scenario was rejected during final state synchronization")
        await self.initialize_geometry(socket, case)
        initial_counts = self.initial_inventory(case["initialState"])
        try:
            await self.wait_value(
                socket,
                lambda values: self.observed_inventory(values) == initial_counts,
                10.0,
                "test setup did not synchronize the requested inventory",
            )
        except TimeoutError as error:
            raise AssertionError(
                "test setup did not synchronize the requested inventory: "
                f"expected={initial_counts}, observed={self.observed_inventory(self.values)}"
            ) from error
        try:
            await self.wait_value(socket, lambda v: not self.setup_differences(case["initialState"], v), 10.0,
                                  "initial slot locations or machine states were not applied")
        except TimeoutError as error:
            raise AssertionError("; ".join(self.setup_differences(case["initialState"], self.values)[:8])) from error
        self.check("Начальное состояние по слотам и станкам", True, True)
        if case.get("expectations", {}).get("testKind") == "fault-recovery":
            await self.run_fault_recovery(socket, case, index, total, initial_counts)
            return
        expected = str(
            case.get("expectations", {}).get("firstDecision")
            or expected_first_decision(case["initialState"])
        )
        if expected == "robot-error-reset":
            await self.exercise_robot_error_reset(socket)
        if case.get("expectations", {}).get("testKind") == "general-four-batches":
            await self.prepare_general_cycle(socket)

        magazine_to_enable = int(
            case.get("expectations", {}).get("enableMagazineBeforeStart", 0)
        )
        if magazine_to_enable:
            root = f"astMagazineStatus[{magazine_to_enable}]"
            await self.wait_value(
                socket,
                lambda values: bool(values.get(f"{root}.xEnableSequenceAllowed", False)),
                20.0,
                f"magazine {magazine_to_enable} does not allow Enable with both payloads",
            )
            await self.command(socket, "magazine.enable", magazine=magazine_to_enable)
            await self.wait_value(
                socket,
                lambda values: bool(values.get(f"{root}.xEnabled", False))
                and bool(values.get(f"{root}.xReady", False)),
                20.0,
                f"magazine {magazine_to_enable} did not enable with both payloads",
            )

        await self.send(socket, {
            "type": "test-progress", "caseIndex": index, "caseCount": total,
            "stage": "running", "name": case["name"],
        })
        if expected == "no-task":
            await self.enter_automatic_mode(socket)
            await self.wait_value(
                socket,
                lambda values: not bool(values.get("stCellStatus.xStartCheckTaskAvailable", True))
                and not bool(values.get("stCellStatus.xStartAllowed", True)),
                15.0,
                "PLC did not report the expected no-task start block",
            )
            self.check("Пуск без задачи запрещён PLC", False, bool(self.values.get("stCellStatus.xStartAllowed", True)))
            return
        self._case_magazine_counters = [int(self.values.get(f"astMagazineStatus[{i}].udiProducedPartsTotal", 0)) for i in (1, 2)]
        self._case_geometry_counters = [int(self.values.get(f"astGeometryStatus[{i}].udiProducedPartsTotal", 0)) for i in (1, 2)]
        self._case_robot_pallets = [int(self.values.get(f"astTwinStatus[{i}].uiRobotPallet", 0)) for i in (1, 2)]
        await self.start_automatic_cycle(socket)
        if case.get("expectations", {}).get("testKind") == "operator-cancel":
            await self.wait_value(
                socket,
                lambda values: bool(values.get("stCellStatus.xOperatorPromptActive", False)),
                20.0,
                "PLC did not open the operator prompt to cancel",
            )
            await self.command(socket, "cell.operatorCancel")
            await self.wait_value(
                socket,
                lambda values: not bool(values.get("stCellStatus.xOperatorPromptActive", False))
                and not bool(values.get("stCellStatus.xRunning", False)),
                20.0,
                "operator cancellation did not return the cell to idle",
            )
            if bool(self.values.get("xGlobalError", False)):
                raise AssertionError("operator cancellation created a global error")
            observed_counts = self.observed_inventory(self.values)
            self.check("Баланс изделий", initial_counts, observed_counts)
            if observed_counts != initial_counts:
                raise AssertionError(
                    f"operator cancellation changed inventory: initial={initial_counts}, observed={observed_counts}"
                )
            return
        has_initial_payload = any(int(item["content"]) for item in case["initialState"]["grippers"])
        if has_initial_payload:
            await self.answer_operator_prompts(socket, case["initialState"])
        await self.wait_value(
            socket,
            lambda values: bool(values.get("stCellStatus.xRunning", False)),
            15.0,
            "PLC did not enter automatic cycle after prestart confirmation",
        )
        if expected == "operator-type-choice":
            payload_type = int(case["initialState"]["grippers"][0]["productType"])
            expected_machine = next(
                (
                    machine_index
                    for machine_index, machine in enumerate(case["initialState"]["machines"], 1)
                    if int(machine["state"]) == 1
                    and int(machine["productType"]) == payload_type
                ),
                0,
            )
            await self.wait_value(
                socket,
                lambda values: expected_machine > 0
                and int(values.get("stTestObservability.uiSelectedMachine", 0)) == expected_machine
                and bool(values.get("stCellStatus.xRunning", False)),
                15.0,
                f"PLC did not select compatible machine {expected_machine}",
            )
            self.check("Совместимый станок после ответа оператора", expected_machine, int(self.values.get("stTestObservability.uiSelectedMachine", 0)))
            await self.stop_cell_if_running(socket)
            await self.wait_value(
                socket,
                lambda values: not bool(values.get("stCellStatus.xRunning", True)),
                45.0,
                "operator decision test did not stop",
            )
            if bool(self.values.get("xGlobalError", False)):
                raise AssertionError("operator decision test created a global error")
            observed_counts = self.observed_inventory(self.values)
            self.check("Баланс изделий", initial_counts, observed_counts)
            if observed_counts != initial_counts:
                raise AssertionError(
                    f"operator decision changed inventory: initial={initial_counts}, observed={observed_counts}"
                )
            return
        special = case.get("expectations", {}).get("testKind") or ("pallet-swap" if expected == "pallet-swap" else None)
        if special in ("geometry-route", "pallet-swap"):
            expectations = case["expectations"]
            if special == "geometry-route":
                states = expectations.get("callStates", {})
                if states:
                    await self.wait_value(socket, lambda v: all(v.get(f"astGeometryCalls[{i}].uiState") == target for i, target in states.items()),
                                          240.0 if self.speed_profile == "realtime" else 90.0, "GK calls did not reach the expected terminal/waiting states")
                    for machine, target in states.items():
                        self.check(f"Вызов со станка {machine}", target, self.values.get(f"astGeometryCalls[{machine}].uiState"))
                    for machine, target in expectations.get("destinations", {}).items():
                        self.check(f"Маршрут со станка {machine}", target, self.values.get(f"astGeometryCalls[{machine}].uiStation"))
                    for machine, target in states.items():
                        if target == 4:
                            station = self.values.get(f"astGeometryCalls[{machine}].uiStation")
                            self.check(f"Назначение вызова {machine} существует", True, station in (1, 2))
                            self.check(f"ГК {station} занят доставленной деталью", True, bool(self.values.get(f"astGeometryStatus[{station}].xOccupied", False)))
                        elif target == 1:
                            self.check(f"Ожидающая деталь осталась в станке {machine}", 1, self.values.get(f"astMachineStatus[{machine}].ePartType"))
                        elif target == 5:
                            destination = self.values.get(f"astGeometryCalls[{machine}].uiMagazine", 0)
                            slot = self.values.get(f"astGeometryCalls[{machine}].uiSlot", 0)
                            self.check("Обход ГК имеет назначение в магазине", True, destination in (1, 2) and 1 <= slot <= (96 if case["initialState"]["magazineMode"] == 1 else 120))
                            pallet = self.values.get(f"astGeometryCalls[{machine}].uiPallet", 0)
                            root = f"astTwinStore[{destination}].astPallet[{pallet}]" if case["initialState"]["magazineMode"] == 1 else f"astMagazineInventory[{destination}]"
                            self.check("Деталь действительно лежит в слоте обхода", True, bool(self.values.get(f"{root}.aSlots[{slot}].xInPosition", False)) and self.values.get(f"{root}.aSlots[{slot}].eDetailType") == 2)
                    stations = [self.values.get(f"astGeometryCalls[{i}].uiStation") for i, target in states.items() if target == 4]
                    self.check("Разные детали занимают разные ГК", len(stations), len(set(stations)))
                    self.check("Подтверждённый выпуск ГК", len(stations), sum((int(self.values.get(f"astGeometryStatus[{i}].udiProducedPartsTotal", 0)) - self._case_geometry_counters[i - 1]) & 0xFFFFFFFF for i in (1, 2)))
                else:
                    await self.wait_value(socket, lambda v: any(int(v.get(f"astMagazineStatus[{i}].udiProducedPartsTotal", 0)) > self._case_magazine_counters[i - 1] for i in (1, 2)),
                                          180.0, "uncalled detail did not reach the magazine")
                    self.check("Без вызова выпуск магазина увеличен один раз", 1, sum((int(self.values.get(f"astMagazineStatus[{i}].udiProducedPartsTotal", 0)) - self._case_magazine_counters[i - 1]) & 0xFFFFFFFF for i in (1, 2)))
                    self.check("Без вызова ГК не занимает станцию", False, any(self.values.get(f"astGeometryStatus[{i}].xOccupied", False) for i in (1, 2)))
            else:
                before = self._case_robot_pallets[0]
                await self.wait_value(socket, lambda v: v.get("astTwinStatus[1].uiRobotPallet") == 3 - before
                                      and not v.get("astTwinStatus[1].xBusy", True) and v.get("astTwinStatus[1].xReady", False) and v.get("astTwinStatus[1].xConfirmed", False), 120.0, "confirmed operator pallet was not exchanged")
                self.check("Подана другая физическая палета", 3 - before, self.values.get("astTwinStatus[1].uiRobotPallet"))
            await self.stop_cell_if_running(socket)
            await self.wait_value(socket, lambda v: not v.get("stCellStatus.xRunning", True) and not v.get("stRobotStatus.xBusy", True), 60.0, "special scenario did not stop")
            self.check("Баланс изделий", initial_counts, self.observed_inventory(self.values))
            self.check("Глобальная авария", False, bool(self.values.get("xGlobalError", False)))
            return
        expected_magazine = int(case.get("expectations", {}).get("expectedMagazine", 0))
        wait_for_decision = self.wait_stable_value if expected == "held-blank-wait" else self.wait_value
        await wait_for_decision(
            socket,
            lambda values: bool(values.get("stCellStatus.xRunning", False))
            and self.decision_matches(expected, values)
            and (
                expected_magazine == 0
                or int(values.get("stTestObservability.uiActiveMagazine", 0)) == expected_magazine
            ),
            120.0 if self.speed_profile == "realtime" else 40.0,
            f"unexpected first PLC decision; expected {expected}, magazine={expected_magazine or 'any'}",
        )

        if expected in ("safe-stop", "robot-error-reset"):
            self.check("Технологическая операция началась", True, self.decision_matches(expected, self.values))
        else:
            self.check("Первое решение PLC", expected, expected if self.decision_matches(expected, self.values) else "other")
        if expected_magazine:
            self.check("Выбранный магазин", expected_magazine, int(self.values.get("stTestObservability.uiActiveMagazine", 0)))
        if case.get("expectations", {}).get("returnMagazine"):
            await self.wait_value(socket, lambda v: v.get("stTestObservability.uiReturnMagazine") == case["expectations"]["returnMagazine"], 90.0, "supply magazine was not reserved for return after TAKE")
            self.check("Магазин возврата", case["expectations"]["returnMagazine"], self.values.get("stTestObservability.uiReturnMagazine"))

        if expected == "safe-stop":
            await self.stop_cell_if_running(socket)
            await self.wait_value(
                socket, lambda values: not bool(values.get("stCellStatus.xRunning", True)),
                45.0, "safe stop did not finish",
            )
        elif case.get("expectations", {}).get("testKind") == "general-four-batches":
            await self.run_general_cycle(socket, case, index, total, initial_counts)
        elif expected != "held-blank-wait" and bool(case.get("expectations", {}).get("fullCycle", True)):
            await self.wait_value(
                socket, lambda values: not bool(values.get("stCellStatus.xRunning", True)),
                180.0 if self.speed_profile == "realtime" else 60.0,
                "automatic cycle did not finish",
            )
        else:
            await self.stop_cell_if_running(socket)
            await self.wait_value(
                socket, lambda values: not bool(values.get("stCellStatus.xRunning", True)),
                45.0, "decision test did not stop",
            )

        if bool(self.values.get("xGlobalError", False)):
            raise AssertionError(
                f"unexpected PLC error source={self.values.get('stTestObservability.uiErrorSource')} "
                f"code={self.values.get('stTestObservability.dwErrorCode')}"
            )
        observed_counts = self.observed_inventory(self.values)
        self.check("Цикл остановлен или завершён", False, bool(self.values.get("stCellStatus.xRunning", False)))
        self.check("Баланс изделий", initial_counts, observed_counts)
        self.check("Глобальная авария", False, bool(self.values.get("xGlobalError", False)))

    async def cleanup_run(self, socket: Any) -> None:
        self._cleanup_active = True
        errors: list[str] = []
        aborted = bool(getattr(self, "_abort_requested", False))

        async def cleanup_step(label: str, operation: Any) -> None:
            try:
                await operation
            except Exception as error:
                errors.append(f"{label}: {error}")

        if aborted:
            await cleanup_step("test abort", self.command(socket, "test.abort", value=True))

        if not self._plc_control_started:
            try:
                if aborted:
                    await cleanup_step(
                        "test abort release", self.command(socket, "test.abort", value=False),
                    )
                await cleanup_step("test session", self.command(socket, "test.session", value=False))
            finally:
                await self.release_python_simulator()
            if errors:
                raise RuntimeError("; ".join(errors))
            return

        try:
            await cleanup_step("cell stop", self.stop_cell_if_running(socket))
            await cleanup_step("fault cleanup", self.clear_fault_sources(socket))
            await cleanup_step("cell idle", self.wait_value(
                socket,
                lambda values: not bool(values.get("stCellStatus.xRunning", False))
                and not bool(values.get("stRobotStatus.xBusy", False)),
                45.0,
                "cell did not stop during cleanup",
            ))
            await cleanup_step("manual mode", self.ensure_manual_control(socket))
            await cleanup_step("GK stop", self.stop_geometry(socket))
            await cleanup_step("robot and cell reset", self.reset_robot_and_cell(socket))
            if self._simulator_session_acquired:
                await cleanup_step("robot idle", self.wait_value(
                    socket, lambda values: not bool(values.get("stRobotStatus.xBusy", False)),
                    30.0, "robot did not become idle during cleanup",
                ))
                if not aborted:
                    await cleanup_step("robot HOME_SAFETY", self.ensure_safety_home(socket))
                simulator_target_mode = (
                    RobotMode.STOPPED if self._interface_changed else self._initial_simulator_mode
                )
                await cleanup_step(
                    "simulator mode",
                    asyncio.to_thread(self.simulator_control.set_mode, simulator_target_mode),
                )
            if self._environment_changed:
                await cleanup_step(
                    "test environment",
                    self.restore_test_environment(socket),
                )
            elif self._speed_changed:
                # Changing the environment already resets the PLC speed profile
                # to REALTIME. A separate request in NORMAL would be rejected.
                await cleanup_step(
                    "speed profile",
                    self.set_test_speed_profile(
                        socket,
                        self._initial_speed,
                        timeout=90.0 if self.speed_profile == "realtime" else 30.0,
                        label="test speed profile did not return to its initial value",
                    ),
                )
            if self._interface_changed:
                initial_mode = 1 if self._initial_modbus_mode else 0
                mode_name = "Modbus" if initial_mode else "SoftMotion"
                await cleanup_step(
                    f"{mode_name} request",
                    self.command(socket, "robot.controlMode.set", value=initial_mode),
                )
                await cleanup_step(f"{mode_name} confirmation", self.wait_value(
                    socket,
                    lambda values: bool(values.get("xModbusMode", False)) == bool(initial_mode),
                    20.0, f"robot interface did not return to {mode_name}",
                ))
        finally:
            try:
                if aborted:
                    await cleanup_step(
                        "test abort release", self.command(socket, "test.abort", value=False),
                    )
                await cleanup_step("test session", self.command(socket, "test.session", value=False))
            finally:
                await self.release_python_simulator()
        if errors:
            raise RuntimeError("; ".join(errors))

    async def run(self) -> int:
        separator = "&" if "?" in self.base_uri else "?"
        uri = self.base_uri + separator + urlencode({
            "role": "test-runner", "runId": self.run_id, "token": self.token,
        })
        async with websockets.connect(uri, max_size=4 * 1024 * 1024) as socket:
            hello = await self.wait_for(
                socket, lambda message, _values: message.get("type") == "test-run-config",
                10.0, "runner config",
            )
            await self.wait_for(
                socket, lambda message, _values: message.get("type") == "snapshot",
                10.0, "initial PLC snapshot",
            )
            config = hello["config"]
            self.require_magazine_mode(self.values, int(config.get("magazineMode", 0)))
            if self.values.get("stTestObservability.uiSchemaVersion") != 3:
                raise RuntimeError("PLC test schema v3 is required before any command")
            cases = self.suite(config)
            fail_fast = str(config.get("suite", "smoke")).lower() in ("general", "acceptance", "recovery")
            self._initial_modbus_mode = bool(self.values.get("xModbusMode", False))
            self._initial_environment = int(self.values.get("uiTestEnvironmentApplied", 0))
            self._initial_speed = int(self.values.get("uiTestSpeedProfileApplied", 0))
            heartbeat_task = asyncio.create_task(self.maintain_hmi_heartbeat(socket))
            simulator_heartbeat_task = asyncio.create_task(self.maintain_simulator_session())
            try:
                # Не активировать случайно удержанный бит от аварийно убитого
                # предыдущего runner при включении новой тестовой сессии.
                await self.command(socket, "test.abort", value=False)
                await self.command(socket, "test.session", value=True)
                try:
                    await self.configure_run(socket, config)
                    for index, case in enumerate(cases, 1):
                        started = time.time()
                        try:
                            await self.run_case(socket, case, index, len(cases))
                            await self.send(socket, {
                                "type": "test-case-result", "status": "PASS", "caseIndex": index,
                                "name": case["name"], "durationMs": round((time.time() - started) * 1000),
                                "reason": "Проверки сценария выполнены", "diagnostics": self.case_diagnostics(case), "scenario": case,
                            })
                        except RunAborted:
                            raise
                        except RecoveryError as error:
                            await self.send(socket, {
                                "type": "test-case-result", "status": "FAIL", "caseIndex": index,
                                "name": case["name"], "stage": "recovery", "reason": str(error),
                                "snapshot": self.values, "scenario": case, "diagnostics": self.case_diagnostics(case),
                                "durationMs": round((time.time() - started) * 1000),
                            })
                            raise
                        except Exception as error:
                            await self.send(socket, {
                                "type": "test-case-result", "status": "FAIL", "caseIndex": index,
                                "name": case["name"], "stage": self._recovery_stage or "execute", "reason": str(error),
                                "snapshot": self.values, "scenario": case, "diagnostics": self.case_diagnostics(case),
                                "durationMs": round((time.time() - started) * 1000),
                            })
                            await self.stop_cell_if_running(socket)
                            if fail_fast:
                                break
                finally:
                    await self.cleanup_run(socket)
            finally:
                heartbeat_task.cancel()
                simulator_heartbeat_task.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat_task
                with suppress(asyncio.CancelledError):
                    await simulator_heartbeat_task
            await self.send(socket, {"type": "test-run-finished"})
        return 0


def main() -> int:
    try:
        return asyncio.run(GatewayRunner().run())
    except Exception as error:
        print(f"test runner failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
