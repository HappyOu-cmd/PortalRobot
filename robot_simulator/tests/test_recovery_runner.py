"""In-memory transport checks: strict recovery proof and failure propagation."""
from __future__ import annotations

import asyncio
import copy

import pytest

from robot_simulator.recovery_scenarios import recovery_scenarios
from robot_simulator.test_runner import GatewayRunner


CASE = next(c for c in recovery_scenarios() if c["expectations"]["alarmSource"] == 0)


class Transport(GatewayRunner):
    def __init__(self, flaw="", counter=100):
        self.flaw, self.commands, self.loads, self.case_checks = flaw, [], 0, []
        self._simulator_session_acquired = False
        self.robot_interface, self.environment, self.speed_profile = "softmotion", "simulation", "realtime"
        self.values = {"uiMagazineMode": 0, "astAlarmEvent[1].udiSequence": 0,
                       "stCellStatus.xRobotAtSafetyHome": True, "stCellStatus.xRunning": False,
                       "stCellStatus.xStartAllowed": True, "stCellStatus.xResetAllowed": True,
                       "stCellFaultStatus.xAllowed": True, "stRobotStatus.xBusy": False,
                       "stRobotStatus.xGripper1Closed": False, "stRobotStatus.xGripper2Closed": False,
                       "stRobotStatus.uiBlankPayloadType": 0, "stRobotStatus.uiDetailPayloadType": 0,
                       "stTestScenario.udiLoadSeq": 8}
        for i in (1, 2, 3):
            self.values.update({f"astMachineStatus[{i}].xError": False,
                                f"astMachineStatus[{i}].ePartType": 0,
                                f"astMachineStatus[{i}].xEnabled": i == 1,
                                f"astMachineStatus[{i}].xCanAcceptService": i == 1,
                                f"astMachineIoStatus[{i}].xChuckClamped": False,
                                f"stMultiType.Config.auiMachineType[{i}]": 1,
                                f"astMachineDiag[{i}].eState": 4 if i == 1 else 0})
        for i, magazine in enumerate(CASE["initialState"]["magazines"], 1):
            self.values[f"astMagazineStatus[{i}].udiProducedPartsTotal"] = counter
            self.values[f"astMagazineStatus[{i}].xEnabled"] = magazine["enabled"]
            for at, slot in enumerate(magazine["slots"], 1):
                root = f"astMagazineInventory[{i}].aSlots[{at}]"
                self.values.update({root + ".xInPosition": bool(slot["content"]),
                                    root + ".eDetailType": slot["content"],
                                    root + ".uiProductType": slot["productType"]})
        if flaw == "stale-event":
            self.values.update({"astAlarmEvent[1].udiSequence": 1, "astAlarmEvent[1].xActive": False,
                                "astAlarmEvent[1].eSeverity": 0, "astAlarmEvent[1].eSource": 0,
                                "astAlarmEvent[1].uiCode": 0})

    async def send(self, socket, payload):
        pass

    async def wait_value(self, socket, predicate, timeout, label):
        if not predicate(self.values):
            raise TimeoutError(label)

    async def wait_stable_value(self, socket, predicate, timeout, label, **kwargs):
        await self.wait_value(socket, predicate, timeout, label)

    async def command(self, socket, command, **fields):
        self.commands.append(command)
        if command == "fault.cellBothGrippers":
            self.values.update({"astAlarmEvent[1].udiSequence": 1, "astAlarmEvent[1].xActive": True,
                                "astAlarmEvent[1].eSeverity": 0, "astAlarmEvent[1].eSource": 0,
                                "astAlarmEvent[1].uiCode": 9 if self.flaw == "wrong-code" else 0,
                                "stCellStatus.xError": True, "stCellStatus.xStartAllowed": False})
            if self.flaw == "short-primary":
                self.values["astAlarmEvent[1].xActive"] = False
        elif command == "cell.reset":
            if self.flaw == "latched":
                return
            self.values.update({"astAlarmEvent[1].xActive": False, "stCellStatus.xError": False,
                                "stCellStatus.xStartAllowed": True})
            if self.flaw == "auto-restart":
                self.values["stCellStatus.xRunning"] = True
            if self.flaw == "lost-stock":
                self.values["astMagazineInventory[1].aSlots[1].xInPosition"] = False
            if self.flaw == "other-owner":
                self.values["astMachineStatus[2].xError"] = True
        elif command == "cell.stop":
            self.values["stCellStatus.xRunning"] = False

    async def ensure_manual_control(self, socket):
        self.commands.append("manual")

    async def ensure_softmotion_drives(self, socket):
        pass

    async def ensure_safety_home(self, socket):
        self.commands.append("manual-home")
        if self.flaw == "home-drops-part":
            self.values["astMagazineInventory[1].aSlots[1].xInPosition"] = False

    async def start_automatic_cycle(self, socket):
        self.commands.append("cell.start")
        self.values["stCellStatus.xRunning"] = True
        for i in (1, 2):
            root = f"astMagazineInventory[1].aSlots[{i}]"
            self.values[root + ".eDetailType"] = 1 if self.flaw == "unprocessed" else 2
        if self.flaw != "no-new-output":
            path = "astMagazineStatus[1].udiProducedPartsTotal"
            self.values[path] = (self.values[path] + 2) & 0xFFFFFFFF

    async def recover_between_cases(self, socket):
        pass

    async def apply_scenario(self, socket, case):
        self.loads += 1
        return True

    async def initialize_robot(self, socket, state):
        pass

    async def initialize_geometry(self, socket, case):
        pass

    @staticmethod
    def setup_differences(state, values):
        return []


@pytest.mark.parametrize("counter", [100, 0xFFFFFFFF])
def test_run_case_dispatches_recovery_and_accepts_only_new_finished_output(counter):
    runner = Transport(counter=counter)
    asyncio.run(runner.run_case(None, copy.deepcopy(CASE), 1, 1))
    assert runner.loads == 2  # Initial setup only; no Apply during/after recovery.
    sequence = runner.commands
    assert sequence.count("cell.reset") == sequence.count("cell.start") == 1
    assert sequence.index("cell.reset") < sequence.index("manual-home") < sequence.index("cell.start")
    assert all(c["passed"] for c in runner.case_checks)
    assert not runner.values["stCellStatus.xRunning"]


@pytest.mark.parametrize("flaw", ["wrong-code", "stale-event", "latched", "auto-restart", "lost-stock",
                                  "other-owner", "home-drops-part", "unprocessed", "no-new-output"])
def test_each_missing_recovery_guarantee_fails_instead_of_reloading_or_passing(flaw):
    runner = Transport(flaw)
    with pytest.raises((AssertionError, TimeoutError)):
        asyncio.run(runner.run_case(None, copy.deepcopy(CASE), 1, 1))
    assert runner.loads == 2
    assert runner.commands.count("cell.reset") <= 1
    if flaw not in ("unprocessed", "no-new-output"):
        assert "cell.start" not in runner.commands


def test_missing_alarm_feedback_is_not_interpreted_as_a_clean_cell():
    runner = Transport()
    del runner.values["astAlarmEvent[1].udiSequence"]
    with pytest.raises(AssertionError, match="feedback is missing"):
        asyncio.run(runner.run_case(None, copy.deepcopy(CASE), 1, 1))
    assert "fault.enable" not in runner.commands


def test_a_short_primary_alarm_is_proven_by_its_new_plc_journal_sequence():
    runner = Transport("short-primary")
    asyncio.run(runner.run_case(None, copy.deepcopy(CASE), 1, 1))
    assert "cell.start" in runner.commands


@pytest.mark.parametrize("changed", ["candidate", "moving", "home-required", "confirmed-other-role"])
def test_recovery_never_confirms_a_changed_or_unprepared_physical_pallet(changed):
    runner = Transport()
    for i, role in enumerate((1, 2), 1):
        root = f"astTwinStatus[{i}]"
        runner.values.update({root + ".uiRobotPallet": role, root + ".uiCandidate": role,
                              root + ".xConfirmed": False, root + ".xConfirmAllowed": True,
                              root + ".xHomeRequired": False, root + ".xBusy": False,
                              root + ".udiRevision": 7})
    if changed == "candidate":
        runner.values["astTwinStatus[1].uiCandidate"] = 2
    elif changed == "moving":
        runner.values["astTwinStatus[1].xBusy"] = True
    elif changed == "home-required":
        runner.values["astTwinStatus[1].xHomeRequired"] = True
    else:
        runner.values["astTwinStatus[1].xConfirmed"] = True
        runner.values["astTwinStatus[1].uiRobotPallet"] = 2
    with pytest.raises((AssertionError, TimeoutError)):
        asyncio.run(runner.confirm_recovery_pallets(None, (1, 2)))
    assert runner.commands == []
