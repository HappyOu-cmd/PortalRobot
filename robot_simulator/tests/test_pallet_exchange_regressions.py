"""Execute bounded decisions from the actual ST across PLC scan boundaries.

This is a source regression check; it does not compile or run CODESYS.
"""
import os
from pathlib import Path
import re

import pytest

from test_hmi_command_contract import execute


APP = Path(__file__).resolve().parents[2] / "Portal_robot/Device/application"
BASELINE = os.environ.get("PORTAL_PALLET_SOURCE_ROOT")


def read(name):
    path = APP / name
    if BASELINE and (Path(BASELINE) / name).exists():
        path = Path(BASELINE) / name
    return path.read_text(encoding="utf-8-sig")


MANAGER = read("FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st")
MAGAZINE = read("FB/FB_MAGAZINE.st")
TWIN = read("FB/FB_TWO_PALLET.st")
RUN = read("PLC_PRG.RunTwoPallet.st")
RUN_MAGAZINE = read("PLC_PRG.RunMagazine.st")


def run(source, values):
    source = re.sub(r"//[^\n]*", "", source).replace("SINT#", "UINT#")
    source = re.sub(r"DWORD#16#([0-9A-Fa-f_]+)",
                    lambda m: str(int(m[1].replace("_", ""), 16)), source)
    for match in reversed(list(re.finditer(r"CASE (\w+) OF(.*?)END_CASE;", source, re.S))):
        branches = re.findall(r"(E_\w+\.\w+):(.*?)(?=E_\w+\.\w+:|$)", match[2], re.S)
        assert branches, "Only the extracted enum CASE is supported"
        replacement = "\n".join(
            f"{'IF' if i == 0 else 'ELSIF'} {match[1]} = {label} THEN {body}"
            for i, (label, body) in enumerate(branches)
        ) + "\nEND_IF;"
        source = source[:match.start()] + replacement + source[match.end():]
    for enum in re.findall(r"\bE_\w+\.\w+", source):
        values[enum] = enum

    # The shared mailbox interpreter accepts scalar names; flatten fixed
    # array/struct fields without changing the conditions being executed.
    aliases = {}

    def flatten(match):
        name = match[0]
        if "[" not in name:
            return name
        alias = aliases.setdefault(name, f"pallet_field_{len(aliases)}")
        if name in values:
            values[alias] = values[name]
        return alias

    source = re.sub(r"\b[A-Za-z_]\w*(?:\.\w+|\[\d+\])+", flatten, source)
    execute(source, values)
    for name, alias in aliases.items():
        if alias in values:
            values[name] = values.pop(alias)


def assignment(source, name):
    match = re.search(re.escape(name) + r"\s*:=\s*(.*?);", source, re.S)
    assert match, name
    return match[0]


def state_body(source, name):
    start = source.index(name + ":") + len(name) + 1
    enum = re.escape(name.split(".", 1)[0])
    end = re.search(r"\n\s*" + enum + r"\.\w+:|\nEND_CASE;", source[start:])
    assert end, name
    return source[start:start + end.start()]


def owner_decision(magazine):
    start = MANAGER.index("IF xRunning\nAND (uiActiveMagazine >= UINT#1)")
    end = MANAGER.index("\nIF (uiActiveMagazine < UINT#1)", start)
    return MANAGER[start:end].replace("[uiActiveMagazine]", f"[{magazine}]")


def scheduler_state(magazine=1, phase="MAGAZINE_EXECUTE"):
    return {
        "xRunning": True, "uiActiveMagazine": magazine,
        f"astMagazineStatus[{magazine}].xFinished": True,
        f"astMagazineStatus[{magazine}].xEnabled": True,
        f"astMagazineStatus[{magazine}].xDisablePending": False,
        f"astMagazineStatus[{magazine}].xBusy": False,
        f"axMagazineAutoSwapPending[{magazine}]": True,
        "stRobotStatus.xBusy": False, "stRobotStatus.xError": False,
        "stMagazineStatus.xError": False, "stMagazineStatus.xRobotStopRequired": False,
        "stMagazineStatus.xBusy": False, "stMagazineStatus.xDone": True,
        "stMagazineStatus.xFinished": True, "xActiveMagazineAutoSwapPending": True,
        "xAlternateMagazineAvailable": False, "xUseAlternateMagazineForDetail": False,
        "eState": f"E_CELL_MANAGER_STATE.{phase}",
        "eMagazineOperation": "E_MAGAZINE_OPERATION.PUT",
        "eMachineOperation": "E_MACHINE_OPERATION.UNLOAD",
        "uiSelectedMachine": 3, "uiSelectedType": 1,
        "iTakeSlot": 0, "iPutSlot": 2, "iTakeOriginSlot": 0,
        "xStopRequested": False,
    }


def exchange_request(magazine, overrides=None):
    values = {
        "GVL_TWO_PALLET.uiMode": 1, "GVL_CELL_MANAGER.Status.xRunning": True,
        "GVL_CELL_MANAGER.Status.xStopPending": False,
        "GVL_CELL_CONTROL.xStop": False, "GVL_CELL_CONTROL.xManual": False,
        f"GVL_MAGAZINE.astPartStatus[{magazine}].xFinished": True,
        f"GVL_TWO_PALLET.astStatus[{magazine}].xEnabled": True,
        f"GVL_TWO_PALLET.astStatus[{magazine}].xError": False,
        f"astTwinCommand[{magazine}].xDisable": False,
        f"astTwinCommand[{magazine}].xStop": False,
        "xTwinAutoSwapEnabled": True, "xTwinOtherLoaded": True,
    }
    values.update(overrides or {})
    source = RUN.replace("[uiTwin]", f"[{magazine}]")
    target = f"axTwinAutoSwapPending[{magazine}]"
    decisions = re.findall(re.escape(target) + r"\s*:=\s*.*?;", source, re.S)
    assert len(decisions) == 2, "Request and post-FB cancellation must both exist"
    for decision in decisions:
        run(decision, values)
    return values[target]


def enable_decision(magazine):
    expressions = re.findall(r"\bxHmiEnable := (.*?),\n", RUN_MAGAZINE, re.S)
    assert len(expressions) == 2
    return "enable := " + expressions[magazine - 1] + ";"


def magazine_scan(values, magazine):
    values[f"fbMagazine{magazine}.Status.xEnabled"] = values["Status.xEnabled"]
    values[f"fbMagazine{magazine}.Status.xFinished"] = values["Status.xFinished"]
    run(enable_decision(magazine), values)
    values["rtEnable.Q"] = values["enable"] and not values["previous_enable"]
    values["previous_enable"] = values["enable"]
    if values["Diag.eState"] == "E_MAGAZINE_STATE.DISABLED":
        run(state_body(MAGAZINE, "E_MAGAZINE_STATE.DISABLED"), values)
    else:
        idle = state_body(MAGAZINE, "E_MAGAZINE_STATE.IDLE")
        idle = idle[:idle.index("// Активный автоматический цикл")] + "END_IF;"
        run(idle, values)
    run(assignment(MAGAZINE, "Status.xEnabled"), values)
    run(assignment(MAGAZINE, "Status.xFinished"), values)


def magazine_state(magazine, phase="DISABLED"):
    return {
        "GVL_TWO_PALLET.uiMode": 1,
        f"GVL_TWO_PALLET.astStatus[{magazine}].xReady": True,
        f"GVL_HMI.astMagazineCommand[{magazine}].xEnable": False,
        "GVL_HMI.xMagazineEnable": False,
        "Diag.eState": f"E_MAGAZINE_STATE.{phase}",
        "Status.xEnabled": phase == "IDLE", "Status.xFinished": True,
        "Status.xBusy": False, "Status.xEnableSequenceAllowed": True,
        "fbFaultInjector.Status.xBusy": False, "previous_enable": False,
        "xFinishedCondition": True,
    }


@pytest.mark.parametrize("magazine", [1, 2])
@pytest.mark.parametrize("phase", ["DISABLED", "IDLE"])
def test_finished_pallet_stays_disabled_for_80_scans(magazine, phase):
    values = magazine_state(magazine, phase)
    for _ in range(80):
        magazine_scan(values, magazine)
        assert values["Diag.eState"] == "E_MAGAZINE_STATE.DISABLED"
        assert not values["Status.xEnabled"]


@pytest.mark.parametrize("magazine", [1, 2])
def test_loaded_bank_reenables_after_inventory_refresh(magazine):
    values = magazine_state(magazine)
    magazine_scan(values, magazine)
    values["xFinishedCondition"] = False  # New bank contains blanks.
    magazine_scan(values, magazine)
    assert not values["Status.xEnabled"]  # Last scan's Finished still blocks Enable.
    magazine_scan(values, magazine)
    assert values["Status.xEnabled"]
    assert not values["Status.xFinished"]


@pytest.mark.parametrize("magazine", [1, 2])
@pytest.mark.parametrize("phase", ["MAGAZINE_EXECUTE", "RELEASE_MAGAZINE"])
@pytest.mark.parametrize("alternate", [False, True])
def test_finished_done_keeps_owner_until_exchange_window(magazine, phase, alternate):
    values = scheduler_state(magazine, phase)
    values["xAlternateMagazineAvailable"] = alternate
    run(owner_decision(magazine), values)
    assert values["uiActiveMagazine"] == magazine
    assert values["eState"] == f"E_CELL_MANAGER_STATE.{phase}"
    assert values["eMagazineOperation"] == "E_MAGAZINE_OPERATION.PUT"


@pytest.mark.parametrize("overrides", [
    {"GVL_CELL_MANAGER.Status.xStopPending": True},
    {"GVL_CELL_CONTROL.xStop": True},
    {"GVL_CELL_CONTROL.xManual": True},
    {"astTwinCommand[1].xDisable": True},
    {"astTwinCommand[1].xStop": True},
    {"GVL_TWO_PALLET.astStatus[1].xError": True},
    {"GVL_TWO_PALLET.astStatus[1].xEnabled": False},
    {"xTwinAutoSwapEnabled": False},
    {"xTwinOtherLoaded": False},
    {"GVL_TWO_PALLET.uiMode": 0},
])
def test_cancelled_exchange_does_not_hold_finished_owner(overrides):
    values = scheduler_state(phase="WAIT_MAGAZINE")
    values["axMagazineAutoSwapPending[1]"] = exchange_request(1, overrides)
    assert not values["axMagazineAutoSwapPending[1]"]
    run(owner_decision(1), values)
    assert values["uiActiveMagazine"] == 0


def start_exchange(robot_clear, magazine=1):
    values = {
        "xAutoSwap": exchange_request(magazine), "Status.xEnableAllowed": True,
        "xRobotClear": robot_clear, "Status.xEnabled": True, "xOtherLoaded": True,
        "Output.xStop": False, "xCommandPresent": False,
        "Diag.eState": "E_TWO_PALLET_STATE.IDLE", "xManualExchange": True,
    }
    run(assignment(TWIN, "xAutoSwapAllowed"), values)
    start = TWIN.index("IF xAutoSwap\n")
    end = TWIN.index("END_IF;", start) + len("END_IF;")
    run(TWIN[start:end], values)
    return values


def test_pending_exchange_waits_for_robot_clear_permission():
    assert start_exchange(False)["Diag.eState"] == "E_TWO_PALLET_STATE.IDLE"
    assert start_exchange(True)["Diag.eState"] == "E_TWO_PALLET_STATE.AUTO_LOWER"


@pytest.mark.parametrize("magazine", [1, 2])
def test_last_put_releases_command_then_swaps_and_resumes_without_start(magazine):
    values = scheduler_state(magazine)
    assert exchange_request(magazine)
    run(owner_decision(magazine), values)
    run(state_body(MANAGER, "E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE"), values)
    assert values["eState"] == "E_CELL_MANAGER_STATE.RELEASE_MAGAZINE"

    values["stMagazineStatus.xDone"] = False
    run(owner_decision(magazine), values)
    run(state_body(MANAGER, "E_CELL_MANAGER_STATE.RELEASE_MAGAZINE"), values)
    run(assignment(MANAGER, "Status.xMagazineExchangeAllowed"), values)
    assert values["xRunning"] and values["uiActiveMagazine"] == magazine
    assert values["Status.xMagazineExchangeAllowed"]
    assert start_exchange(True, magazine)["Diag.eState"] == "E_TWO_PALLET_STATE.AUTO_LOWER"

    # A single Completed scan still carries the old inventory's Finished.
    values["xMagazineExchangeActive"] = True
    run(owner_decision(magazine), values)
    start = MANAGER.index("IF xMagazineExchangeActive AND")
    end = MANAGER.index("ELSE\nCASE eState OF", start)
    run(MANAGER[start:end] + "END_IF;", values)
    assert values["xRunning"] and values["uiActiveMagazine"] == magazine

    # After the bank refresh, the real empty-gripper planner chooses machine 3.
    values.update({
        f"astMagazineStatus[{magazine}].xFinished": False,
        f"axMagazineAutoSwapPending[{magazine}]": False,
        "stMagazineStatus.xFinished": False, "xActiveMagazineAutoSwapPending": False,
        "xMagazineReady": True, "candidate_before_take": 3,
        "candidate_for_unload": 0, "Config.auiMachineType[3]": 1,
        "stMagazineStatus.stTypeStatus.aiBlankSlot[1]": 1,
    })
    run(owner_decision(magazine), values)
    start = MANAGER.index("\n\t\tELSE\n\t\t\tuiBlankPayloadType := UINT#0;",
                          MANAGER.index("E_CELL_MANAGER_STATE.PLAN_TARGET:"))
    end = MANAGER.index("E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE:", start)
    planner = MANAGER[start + len("\n\t\tELSE"):end].rsplit("END_IF;", 1)[0]
    planner = planner.replace("SelectMachineBeforeTake()", "candidate_before_take")
    planner = planner.replace("SelectMachineForUnload(uiCurrentMachine := UINT#0)", "candidate_for_unload")
    planner = planner.replace("[uiSelectedMachine]", "[3]").replace("[uiSelectedType]", "[1]")
    run(planner, values)
    assert values["xRunning"]
    assert values["eState"] == "E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE"
    assert values["eMagazineOperation"] == "E_MAGAZINE_OPERATION.TAKE"
    assert values["uiSelectedMachine"] == 3
