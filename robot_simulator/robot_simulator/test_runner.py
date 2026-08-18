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
from .test_scenarios import (
    expected_error_owner,
    expected_first_decision,
    generated_scenarios,
    regression_scenarios,
    smoke_scenarios,
    validate_inventory,
)


class RunAborted(RuntimeError):
    pass


class RecoveryError(RuntimeError):
    """The cell is not clean enough to execute another independent test case."""


class GatewayRunner:
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
        self._hmi_heartbeat = 0
        self._initial_modbus_mode = False
        self._initial_simulator_mode = RobotMode.STOPPED
        self._interface_changed = False
        self._initial_environment = 0
        self._initial_speed = 0
        self._environment_changed = False
        self._speed_changed = False
        self._plc_control_started = False

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
        await self.wait_for(
            socket,
            lambda message, _values: message.get("type") == "ack"
            and message.get("requestId") == request_id and bool(message.get("ok")),
            15.0,
            command,
        )

    async def write_level_until_acknowledged(
        self,
        socket: Any,
        command: str,
        predicate: Callable[[dict[str, Any]], bool],
        timeout: float,
        label: str,
        **fields: Any,
    ) -> None:
        """Repeat an idempotent level write until authoritative PLC feedback changes."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            await self.command(socket, command, **fields)
            if predicate(self.values):
                return
            remaining = deadline - time.monotonic()
            if remaining <= 0.0:
                break
            try:
                await self.wait_value(
                    socket,
                    predicate,
                    min(0.75, remaining),
                    label,
                )
                return
            except TimeoutError:
                # GVL_HMI.xCellManual is both command and published feedback.
                # A single asynchronous OPC UA write can land after ReadHmiInputs
                # and be overwritten by PublishHmi in the same PLC scan.
                continue
        raise TimeoutError(label)

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
        suite = config.get("suite", "smoke")
        if config.get("scenarios"):
            return config["scenarios"]
        if suite == "regression":
            return regression_scenarios()
        if suite == "generated":
            return generated_scenarios(int(config.get("seed", 1)), int(config.get("count", 100)))
        return smoke_scenarios()

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
        self.environment = str(config.get("environment", "simulation")).lower()
        self.speed_profile = str(config.get("speedProfile", "realtime")).lower()
        if self.environment == "sc500_bench" and robot_interface != "sc500-modbus":
            raise ValueError("SC-500 bench requires the sc500-modbus interface")
        if self.environment == "sc500_bench" and self.speed_profile == "fast":
            raise ValueError("FAST is forbidden on the SC-500 bench")

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

        if interface_code == 0:
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
        await self.write_level_until_acknowledged(
            socket,
            "cell.manual",
            lambda values: bool(values.get("xCellManual", False))
            and not bool(values.get("stCellStatus.xStartCheckAutomaticMode", True)),
            15.0,
            "PLC did not enter manual mode",
            value=True,
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

    async def begin_robot_action(self, socket: Any, action: int, *, point: int = 0) -> None:
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
        await self.begin_robot_action(socket, action, point=point)
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
        await self.write_level_until_acknowledged(
            socket,
            "cell.manual",
            lambda values: bool(values.get("stCellStatus.xStartCheckAutomaticMode", False)),
            15.0,
            "PLC did not enter automatic mode",
            value=False,
        )

    async def start_automatic_cycle(self, socket: Any) -> None:
        """Never pulse Start until the PLC itself reports that Start is allowed."""
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
        await self.wait_value(
            socket,
            lambda values: bool(values.get("xTestEnvironmentChangeAllowed", False)),
            timeout,
            "PLC equipment did not become idle for the test speed change",
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
        if expected == "return-blank":
            return magazine_operation == 4
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
        return (
            int(values.get("stTestObservability.uiRobotAction", 0)) != 0
            or magazine_operation != 0
            or any(machine_operations)
        )

    @staticmethod
    def initial_inventory(initial_state: dict[str, Any]) -> dict[int, int]:
        counts = {1: 0, 2: 0, 3: 0}
        for slot in initial_state["slots"]:
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
        for magazine in range(1, 3):
            for zone, slot_count in ((1, 120), (2, 120), (3, 60)):
                for index in range(1, slot_count + 1):
                    root = f"astMagazineInventory[{magazine}].aZone{zone}[{index}]"
                    if bool(values.get(f"{root}.xInPosition", False)):
                        product_type = int(values.get(f"{root}.uiProductType", 0))
                        if product_type in counts:
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

    async def apply_scenario(self, socket: Any, case: dict[str, Any]) -> bool:
        expected_rejection = bool(case.get("expectations", {}).get("applyRejected"))
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
                return False
            if result != 0:
                raise AssertionError(f"PLC rejected a valid scenario, result={result}")
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
        await self.clear_fault_sources(socket)
        await self.reset_robot_and_cell(socket, robot_fault_expected=True)
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
        await self.clear_fault_sources(socket)
        await self.reset_robot_and_cell(socket, robot_fault_expected=expected_source == 2)
        await self.ensure_safety_home(socket)

    async def clear_fault_sources(self, socket: Any) -> None:
        await self.command(socket, "test.faults.clear")
        if not self._simulator_session_acquired:
            return
        await asyncio.to_thread(self.simulator_control.clear)

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
            await self.ensure_safety_home(socket)
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
        expected = str(
            case.get("expectations", {}).get("firstDecision")
            or expected_first_decision(case["initialState"])
        )
        if expected == "robot-error-reset":
            await self.exercise_robot_error_reset(socket)

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
            return
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
            if observed_counts != initial_counts:
                raise AssertionError(
                    f"operator cancellation changed inventory: initial={initial_counts}, observed={observed_counts}"
                )
            return
        has_initial_payload = any(int(item["content"]) for item in case["initialState"]["grippers"])
        if has_initial_payload:
            await self.answer_operator_prompts(socket, case["initialState"])
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
            if observed_counts != initial_counts:
                raise AssertionError(
                    f"operator decision changed inventory: initial={initial_counts}, observed={observed_counts}"
                )
            return
        await self.wait_value(
            socket, lambda values: self.decision_matches(expected, values),
            120.0 if self.speed_profile == "realtime" else 40.0,
            f"unexpected first PLC decision; expected {expected}",
        )

        if expected == "safe-stop":
            await self.stop_cell_if_running(socket)
            await self.wait_value(
                socket, lambda values: not bool(values.get("stCellStatus.xRunning", True)),
                45.0, "safe stop did not finish",
            )
        elif bool(case.get("expectations", {}).get("fullCycle", True)):
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
        if observed_counts != initial_counts:
            raise AssertionError(f"inventory balance changed: initial={initial_counts}, observed={observed_counts}")

    async def cleanup_run(self, socket: Any) -> None:
        self._cleanup_active = True
        errors: list[str] = []

        async def cleanup_step(label: str, operation: Any) -> None:
            try:
                await operation
            except Exception as error:
                errors.append(f"{label}: {error}")

        if not self._plc_control_started:
            try:
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
            await cleanup_step("robot and cell reset", self.reset_robot_and_cell(socket))
            if self._simulator_session_acquired:
                await cleanup_step("robot idle", self.wait_value(
                    socket, lambda values: not bool(values.get("stRobotStatus.xBusy", False)),
                    30.0, "robot did not become idle during cleanup",
                ))
                await cleanup_step("robot HOME_SAFETY", self.ensure_safety_home(socket))
                simulator_target_mode = (
                    RobotMode.STOPPED if self._interface_changed else self._initial_simulator_mode
                )
                await cleanup_step(
                    "simulator mode",
                    asyncio.to_thread(self.simulator_control.set_mode, simulator_target_mode),
                )
            if self._speed_changed:
                await cleanup_step(
                    "speed profile",
                    self.set_test_speed_profile(
                        socket,
                        self._initial_speed,
                        timeout=90.0 if self.speed_profile == "realtime" else 30.0,
                        label="test speed profile did not return to its initial value",
                    ),
                )
            if self._environment_changed:
                await cleanup_step(
                    "test environment",
                    self.command(socket, "test.environment.set", value=self._initial_environment),
                )
                await cleanup_step("environment confirmation", self.wait_value(
                    socket,
                    lambda values: int(values.get("uiTestEnvironmentApplied", -1)) == self._initial_environment,
                    15.0,
                    "test environment did not return to its initial value",
                ))
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
            cases = self.suite(config)
            self._initial_modbus_mode = bool(self.values.get("xModbusMode", False))
            self._initial_environment = int(self.values.get("uiTestEnvironmentApplied", 0))
            self._initial_speed = int(self.values.get("uiTestSpeedProfileApplied", 0))
            heartbeat_task = asyncio.create_task(self.maintain_hmi_heartbeat(socket))
            simulator_heartbeat_task = asyncio.create_task(self.maintain_simulator_session())
            try:
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
                            })
                        except RunAborted:
                            raise
                        except RecoveryError as error:
                            await self.send(socket, {
                                "type": "test-case-result", "status": "FAIL", "caseIndex": index,
                                "name": case["name"], "stage": "recovery", "reason": str(error),
                                "snapshot": self.values, "scenario": case,
                            })
                            raise
                        except Exception as error:
                            await self.send(socket, {
                                "type": "test-case-result", "status": "FAIL", "caseIndex": index,
                                "name": case["name"], "stage": "execute", "reason": str(error),
                                "snapshot": self.values, "scenario": case,
                            })
                            await self.stop_cell_if_running(socket)
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
