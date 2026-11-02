"""Run the production/route assertions on current ST with in-memory motion I/O.

Apply and manual setup are outside this adapter: their contracts have separate
tests. No socket, gateway process, PLC connection or live command is used here.
"""
from __future__ import annotations

import asyncio
import math

import pytest

from robot_simulator.plc_model.cell import Cell, Machine
from robot_simulator.plc_model.st_runtime import Record, StArray
from robot_simulator.test_runner import GatewayRunner
from robot_simulator.test_scenarios import for_magazine_mode, geometry_scenarios, smoke_scenarios


class StScenarioRunner(GatewayRunner):
    def __init__(self, case, *, operator_stop=False):
        self.environment, self.robot_interface, self.speed_profile = "simulation", "softmotion", "realtime"
        self._simulator_session_acquired = False
        self.commands, self.messages = [], []
        self.operator_stop = operator_stop
        state = case["initialState"]
        self.cell = Cell(
            types=state["typeCount"], mode=state["magazineMode"],
            slots=96 if state["magazineMode"] else 120,
            machines=[Machine({0: "disabled", 1: "empty", 2: "processing", 3: "done"}[m["state"]], m["productType"])
                      for m in state["machines"]],
            magazines=[[(s["content"], s["productType"] if s["content"] else 0)
                        for s in m["slots"]] for m in state["magazines"]],
            enabled=tuple(m["enabled"] for m in state["magazines"]),
            geometry=(False, False), autostart=False,
        )
        self.cell.persistent.xWaitWhenOccupied = state["geometry"]["waitWhenOccupied"]
        # RunGeometryControl seeds these pending calls from an accepted buffer.
        for i, called in enumerate(state["geometry"]["calls"], 1):
            if called:
                call = self.cell.geometry.astCalls[i]
                call.udiId, call.uiMachine, call.uiProductType = i, i, state["machines"][i - 1]["productType"]
                call.uiState, call.xForced = 1, True
        self.sync()

    def sync(self):
        self.values = {"uiMagazineMode": self.cell.mode, "xGlobalError": False}

        def publish(root, obj):
            if isinstance(obj, Record):
                for name in obj._types:
                    publish(root + "." + name, getattr(obj, name))
            elif isinstance(obj, StArray):
                for i, value in enumerate(obj.values, obj.low):
                    publish(f"{root}[{i}]", value)
            else:
                self.values[root] = obj

        manager = self.cell.manager
        publish("stCellStatus", manager.Status)
        publish("stRobotStatus", self.cell.robot)
        publish("astMachineStatus", manager.astMachineStatus)
        publish("stMultiType.Config", manager.Config)
        publish("astGeometryCalls", self.cell.geometry.astCalls)
        publish("astTwinStore", self.cell.twin.astStore)
        publish("astTwinStatus", self.cell.twin.astStatus)
        for i, magazine in enumerate(self.cell.magazines, 1):
            publish(f"astMagazineInventory[{i}]", magazine.stInventory)
            publish(f"astMagazineStatus[{i}]", magazine.Status)
        for i, station in enumerate(self.cell.stations, 1):
            publish(f"astGeometryStatus[{i}]", station.Status)
        for field, value in {
            "uiMagazineOperation": manager.eMagazineOperation, "uiActiveMagazine": manager.uiActiveMagazine,
            "uiReturnMagazine": manager.uiReturnMagazine, "uiSelectedMachine": manager.uiSelectedMachine,
            "uiCellState": manager.Diag.eState,
        }.items():
            self.values[f"stTestObservability.{field}"] = value
        for i in (1, 2, 3):
            self.values[f"stTestObservability.auiMachineOperation[{i}]"] = (
                manager.eMachineOperation if manager.uiSelectedMachine == i else 0)

    def scan(self):
        self.cell.scan(dt=100)
        self.sync()

    async def send(self, _socket, message):
        self.messages.append(message)

    async def recover_between_cases(self, _socket):
        pass

    async def apply_scenario(self, _socket, _case):
        return True

    async def initialize_robot(self, _socket, state):
        assert not any(g["content"] for g in state["grippers"])

    async def command(self, _socket, command, **fields):
        self.commands.append(command)
        if command == "cell.manual":
            self.cell.manager.xManual = fields["value"]
            self.scan()
        elif command == "cell.start":
            self.cell.start()
        elif command == "cell.stop":
            self.cell.manager.xStop = True
            self.scan()
            self.cell.manager.xStop = False
        elif command == "geometry.command":
            station = self.cell.stations[fields["magazine"] - 1]
            station(uiAction=fields["action"])
            station.uiAction = 0
            self.scan()
        else:
            raise AssertionError(f"unexpected in-memory command: {command}")
        self.sync()

    async def wait_value(self, socket, predicate, timeout, label):
        if self.operator_stop and label == "full production did not finish the initial material":
            self.operator_stop = False
            await self.command(socket, "cell.stop")
        for _ in range(math.ceil(timeout * 10)):
            if predicate(self.values):
                return
            self.scan()
        if not predicate(self.values):
            raise TimeoutError(label)

    async def wait_stable_value(self, _socket, predicate, timeout, label, *, stable_for=0.75):
        stable_since = None
        for _ in range(math.ceil(timeout * 10)):
            if predicate(self.values):
                if stable_since is None:
                    stable_since = self.cell.clock.now
                if self.cell.clock.now - stable_since >= stable_for * 1000:
                    return
            else:
                stable_since = None
            self.scan()
        raise TimeoutError(label)


@pytest.mark.parametrize("mode", [0, 1])
@pytest.mark.parametrize("number", [1, 2, 3, 11])
def test_full_cycle_finishes_material_then_stops_partial_magazine(mode, number):
    case = for_magazine_mode(smoke_scenarios()[number - 1], mode)
    runner = StScenarioRunner(case)
    asyncio.run(runner.run_case(None, case, 1, 1))
    expected = runner.initial_inventory(case["initialState"])
    assert runner.finished_inventory(runner.values) == expected
    assert runner.production_complete(runner.values, expected)
    assert not runner.values["stCellStatus.xRunning"]
    assert runner.commands.count("cell.stop") == 1
    assert all(check["passed"] for check in runner.case_checks)


@pytest.mark.parametrize("mode", [0, 1])
def test_ordinary_operator_stop_with_unprocessed_blank_cannot_pass(mode):
    case = for_magazine_mode(smoke_scenarios()[0], mode)
    runner = StScenarioRunner(case, operator_stop=True)
    with pytest.raises(AssertionError, match="Готовые изделия по типам"):
        asyncio.run(runner.run_case(None, case, 1, 1))
    assert not runner.values["stCellStatus.xRunning"]
    assert runner.values["stRobotStatus.xGripper1Closed"]
    assert not any(key.startswith("machine:") for key in runner.cell.operations)
    assert runner.commands.count("cell.stop") == 1
    assert runner.case_checks[-1]["passed"] is False


@pytest.mark.parametrize("mode", [0, 1])
@pytest.mark.parametrize("case", geometry_scenarios(), ids=lambda c: c["name"])
def test_geometry_runtime_cases_match_current_st_start_and_wait_contracts(mode, case):
    case = for_magazine_mode(case, mode)
    runner = StScenarioRunner(case)
    asyncio.run(runner.run_case(None, case, 1, 1))
    assert all(check["passed"] for check in runner.case_checks)
    assert not runner.values["stCellStatus.xRunning"]
    if case["expectations"]["testKind"] == "geometry-start-blocked":
        assert "cell.start" not in runner.commands
        assert runner.values["stCellStatus.xStartCheckMagazineReady"] is False


def test_full_cycle_accepts_wrapped_production_counters():
    case = smoke_scenarios()[2]
    runner = StScenarioRunner(case)
    runner.cell.magazines[0].udiProducedPartsTotal = 0xFFFFFFFE
    runner.scan()
    asyncio.run(runner.run_case(None, case, 1, 1))
    assert runner.cell.magazines[0].Status.udiProducedPartsTotal == 0
    assert next(c for c in runner.case_checks if c["label"] == "Подтверждён новый выпуск")["actual"] == 2
