"""Offline runner checks. Every transport below is in memory; no PLC/socket API."""
from __future__ import annotations

import asyncio
import copy
import json

import pytest

from robot_simulator.test_runner import GatewayRunner
from robot_simulator.test_scenarios import (
    expected_first_decision, fixed_scenarios, for_magazine_mode, generated_scenarios,
    geometry_scenarios, magazine_scenarios, scenario, validate_inventory,
)


def snapshot(state: dict) -> dict:
    values = {"uiMagazineMode": state["magazineMode"], "stTestObservability.uiSchemaVersion": 3,
              "stCellStatus.xStartAllowed": True, "stCellStatus.xStartCheckTaskAvailable": True,
              "stCellStatus.xRunning": False, "stRobotStatus.xBusy": False}
    for m, magazine in enumerate(state["magazines"], 1):
        values[f"astTwinStatus[{m}].uiRobotPallet"] = m
        values[f"astMagazineStatus[{m}].udiProducedPartsTotal"] = 100
        owners = [(f"astMagazineInventory[{m}]", magazine["slots"])] if state["magazineMode"] == 0 else [
            (f"astTwinStore[{m}].astPallet[{m}]", magazine["slots"]),
            (f"astTwinStore[{m}].astPallet[{3 - m}]", magazine["operatorSlots"])]
        for owner, slots in owners:
            for index, slot in enumerate(slots, 1):
                root = f"{owner}.aSlots[{index}]"
                values.update({f"{root}.xInPosition": bool(slot["content"]), f"{root}.eDetailType": slot["content"],
                               f"{root}.uiProductType": slot["productType"] if slot["content"] else 0})
    for i, machine in enumerate(state["machines"], 1):
        values[f"astMachineStatus[{i}].xEnabled"] = machine["state"] != 0
        values[f"astMachineStatus[{i}].ePartType"] = {0: 0, 1: 0, 2: 2, 3: 1}[machine["state"]]
        values[f"stMultiType.Config.auiMachineType[{i}]"] = machine["productType"]
    for i, payload in enumerate(state["grippers"], 1):
        values[f"stRobotStatus.xGripper{i}Closed"] = bool(payload["content"])
        values[f"stRobotStatus.ui{'Blank' if i == 1 else 'Detail'}PayloadType"] = payload["productType"]
    for i in (1, 2):
        values[f"astGeometryStatus[{i}].udiProducedPartsTotal"] = 900 + i
        values[f"astGeometryStatus[{i}].xConfirmAllowed"] = True
        values[f"astGeometryStatus[{i}].xEnableAllowed"] = True
    return values


@pytest.mark.parametrize("mode", [0, 1])
@pytest.mark.parametrize("suite", ["smoke", "regression", "geometry"])
def test_fixed_cases_use_valid_current_inventory_contracts(mode: int, suite: str) -> None:
    for source in fixed_scenarios(suite):
        case = for_magazine_mode(source, mode)
        errors = validate_inventory(case["initialState"])
        assert bool(errors) == bool(case["expectations"].get("applyRejected")), (case["name"], errors)


@pytest.mark.parametrize("mode", [0, 1])
def test_generator_rejects_tenth_case_in_both_shapes_and_reproduces_exactly(mode: int) -> None:
    first = [for_magazine_mode(c, mode) for c in generated_scenarios(50100, 1000)]
    assert first == [for_magazine_mode(c, mode) for c in generated_scenarios(50100, 1000)]
    for case in first:
        assert bool(validate_inventory(case["initialState"])) == bool(case["expectations"].get("applyRejected"))
    assert sum(bool(c["expectations"].get("applyRejected")) for c in first) == 100


def test_oracle_tries_second_magazine_and_accepts_any_free_destination_slot() -> None:
    state = scenario("peer", magazine_enabled=(True, True))["initialState"]
    state["magazines"][1]["slots"] = copy.deepcopy(state["magazines"][0]["slots"])
    state["magazines"][0]["slots"][0]["content"] = 0
    assert expected_first_decision(state) == "machine-load"
    state["magazines"][0]["enabled"] = False
    assert expected_first_decision(state) == "machine-load"


def test_gk_expectation_never_passes_on_unrelated_robot_motion() -> None:
    values = {"stTestObservability.uiRobotAction": 1}
    assert not GatewayRunner.decision_matches("geometry-delivery", values)
    assert not GatewayRunner.decision_matches("pallet-swap", values)
    assert not GatewayRunner.decision_matches("unknown-decision", values)
    values.update({"astGeometryCalls[3].uiState": 4, "astGeometryCalls[3].uiStation": 2})
    assert not GatewayRunner.decision_matches("geometry-delivery", values)
    values["astGeometryStatus[2].xOccupied"] = True
    assert GatewayRunner.decision_matches("geometry-delivery", values)


def test_balance_counts_four_physical_pallets_and_gk_once_without_projection() -> None:
    state = magazine_scenarios()[0]["initialState"]
    for m in state["magazines"]:
        m["operatorSlots"][95]["content"] = 2
    values = snapshot(state)
    values["astMagazineInventory[1].aSlots[1].xInPosition"] = True
    values["astMagazineInventory[1].aSlots[1].uiProductType"] = 3
    assert GatewayRunner.initial_inventory(state) == GatewayRunner.observed_inventory(values) == {1: 3, 2: 0, 3: 0}
    values.update({"astGeometryStatus[2].xOccupied": True, "astGeometryStatus[2].uiProductType": 2})
    assert GatewayRunner.observed_inventory(values) == {1: 3, 2: 1, 3: 0}
    values["astGeometryStatus[2].uiProductType"] = 0
    with pytest.raises(AssertionError, match="unknown product type"):
        GatewayRunner.observed_inventory(values)


def test_setup_detects_wrong_slot_with_unchanged_total_and_unknown_pallet_role() -> None:
    state = magazine_scenarios()[0]["initialState"]
    values = snapshot(state)
    assert not GatewayRunner.setup_differences(state, values)
    a, b = "astTwinStore[1].astPallet[1].aSlots[1]", "astTwinStore[1].astPallet[1].aSlots[2]"
    for field in ("xInPosition", "eDetailType", "uiProductType"):
        values[f"{a}.{field}"], values[f"{b}.{field}"] = values[f"{b}.{field}"], values[f"{a}.{field}"]
    assert GatewayRunner.observed_inventory(values) == GatewayRunner.initial_inventory(state)
    assert len(GatewayRunner.setup_differences(state, values)) == 2
    values["astTwinStatus[2].uiRobotPallet"] = 0
    assert any("unknown physical pallet" in message for message in GatewayRunner.setup_differences(state, values))


def test_negative_gateway_receipt_reports_reason_immediately() -> None:
    class Socket:
        async def send(self, data: str) -> None:
            self.message = json.loads(data)

        async def recv(self) -> str:
            return json.dumps({"type": "ack", "requestId": self.message["requestId"], "ok": False, "error": "PLC rejected: pallet reserved"})

    runner = GatewayRunner.__new__(GatewayRunner)
    runner.values, runner.environment = {}, "simulation"
    with pytest.raises(RuntimeError, match="pallet reserved"):
        asyncio.run(runner.command(Socket(), "twin.command", action=4, magazine=1))


@pytest.mark.parametrize("mode,version", [(None, 3), (1, 3), (0, 2)])
def test_run_rejects_bad_initial_contract_before_any_plc_command(monkeypatch, mode, version) -> None:
    class Socket:
        def __init__(self):
            self.messages = iter([
                {"type": "test-run-config", "config": {"suite": "smoke", "magazineMode": 0}},
                {"type": "snapshot", "values": {"uiMagazineMode": mode, "stTestObservability.uiSchemaVersion": version}},
            ])
            self.sent = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def recv(self):
            return json.dumps(next(self.messages))

        async def send(self, data):
            self.sent.append(data)

    socket = Socket()
    monkeypatch.setattr("robot_simulator.test_runner.websockets.connect", lambda *_a, **_kw: socket)
    runner = GatewayRunner.__new__(GatewayRunner)
    runner.base_uri, runner.run_id, runner.token = "ws://in-memory", "1", "test"
    runner.values, runner.environment = {}, "simulation"
    with pytest.raises(RuntimeError):
        asyncio.run(runner.run())
    assert socket.sent == []


class MemoryRunner(GatewayRunner):
    """Exercise the real runner orchestration with deterministic gateway feedback."""
    def __init__(self, case: dict, *, duplicate_production: bool = False) -> None:
        self.case = case
        self.values = snapshot(case["initialState"])
        self.environment, self.robot_interface, self.speed_profile = "simulation", "softmotion", "realtime"
        self.messages, self.commands = [], []
        self.duplicate_production = duplicate_production
        self._simulator_session_acquired = False

    async def send(self, _socket, data):
        self.messages.append(data)

    async def command(self, _socket, command, **fields):
        self.commands.append((command, fields))
        if command == "geometry.command" and fields["action"] == 1:
            self.values[f"astGeometryStatus[{fields['magazine']}].xReady"] = True

    async def wait_value(self, _socket, predicate, _timeout, label):
        if not predicate(self.values):
            raise TimeoutError(label)

    async def recover_between_cases(self, _socket):
        pass

    async def apply_scenario(self, _socket, _case):
        return True

    async def initialize_robot(self, _socket, _state):
        pass

    async def answer_operator_prompts(self, _socket, _state):
        pass

    async def enter_automatic_mode(self, _socket):
        self.values["stCellStatus.xStartAllowed"] = False
        self.values["stCellStatus.xStartCheckTaskAvailable"] = False

    async def stop_cell_if_running(self, _socket):
        self.values["stCellStatus.xRunning"] = False

    async def start_automatic_cycle(self, _socket):
        self.values["stCellStatus.xRunning"] = True
        expected = self.case["expectations"]
        if expected.get("testKind") == "pallet-swap":
            self.values["astTwinStatus[1].uiRobotPallet"] = 2
            self.values["astTwinStatus[1].xBusy"] = False
            self.values["astTwinStatus[1].xConfirmed"] = True
            self.values["astTwinStatus[1].xReady"] = True
            return
        if expected.get("testKind") != "geometry-route":
            self.values["stTestObservability.uiMagazineOperation"] = {"magazine-take": 2, "magazine-change": 3}.get(expected["firstDecision"], 1)
            self.values["stTestObservability.uiActiveMagazine"] = expected.get("expectedMagazine", 1)
            self.values["stTestObservability.uiReturnMagazine"] = 1
            return
        used = set()
        for machine, state in expected["callStates"].items():
            i = int(machine)
            self.values[f"astGeometryCalls[{i}].uiState"] = state
            if state == 1:
                continue
            self.values[f"astMachineStatus[{i}].ePartType"] = 0
            if state == 4:
                station = expected["destinations"].get(machine) or next(j for j in (1, 2) if j not in used)
                used.add(station)
                self.values.update({f"astGeometryCalls[{i}].uiStation": station,
                                    f"astGeometryStatus[{station}].xOccupied": True,
                                    f"astGeometryStatus[{station}].uiProductType": 1})
                self.values[f"astGeometryStatus[{station}].udiProducedPartsTotal"] += 2 if self.duplicate_production else 1
            else:
                root = "astTwinStore[1].astPallet[1]" if self.case["initialState"]["magazineMode"] == 1 else "astMagazineInventory[1]"
                self.values.update({f"{root}.aSlots[1].xInPosition": True, f"{root}.aSlots[1].eDetailType": 2, f"{root}.aSlots[1].uiProductType": 1,
                                    f"astGeometryCalls[{i}].uiMagazine": 1, f"astGeometryCalls[{i}].uiSlot": 1, f"astGeometryCalls[{i}].uiPallet": 1})
        if not expected["callStates"]:
            self.values["astMachineStatus[1].ePartType"] = 0
            root = "astTwinStore[1].astPallet[1]" if self.case["initialState"]["magazineMode"] == 1 else "astMagazineInventory[1]"
            self.values.update({f"{root}.aSlots[1].xInPosition": True, f"{root}.aSlots[1].eDetailType": 2, f"{root}.aSlots[1].uiProductType": 1,
                                "astMagazineStatus[1].udiProducedPartsTotal": 101})


@pytest.mark.parametrize("case", geometry_scenarios() + [for_magazine_mode(c, 1) for c in geometry_scenarios()] + magazine_scenarios(), ids=lambda c: c["name"])
def test_new_scenarios_complete_real_runner_flow_without_transport(case: dict) -> None:
    runner = MemoryRunner(case)
    asyncio.run(runner.run_case(None, case, 1, 1))
    assert runner.case_checks
    assert all(check["passed"] for check in runner.case_checks)
    assert runner.values["stCellStatus.xRunning"] is False


def test_geometry_runner_detects_double_production_even_with_conserved_inventory() -> None:
    case = geometry_scenarios()[0]
    runner = MemoryRunner(case, duplicate_production=True)
    with pytest.raises(AssertionError, match="expected=1, actual=2"):
        asyncio.run(runner.run_case(None, case, 1, 1))
    assert runner.case_checks[-1]["passed"] is False
    diagnostics = runner.case_diagnostics(case)
    assert diagnostics["checks"][-1]["label"] == "Подтверждённый выпуск ГК"
