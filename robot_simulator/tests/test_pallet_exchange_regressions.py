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
    # Observe the new GK side effect instead of silently skipping the call.
    # Ordinary pallet transitions must never execute it.
    source = re.sub(r"\bF_GEOMETRY_EVENT\(Call\s*:=\s*[^;]*\);",
                    "pallet_test_geometry_event := TRUE;", source)
    values["pallet_test_geometry_event"] = False
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
    assert not values.pop("pallet_test_geometry_event"), "Unexpected GK event in a pallet transition"
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
    # Match the ownership IF with all its current guards, including GK phases.
    guard = re.search(r"\bIF\s+xRunning\b(?:(?!\bTHEN\b).)*?uiActiveMagazine\s*>=\s*UINT#1\b", MANAGER, re.S)
    assert guard, "Active-magazine ownership decision is missing"
    start = guard.start()
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
        f"axMagazineExchangeInProgress[{magazine}]": False,
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
        "xGeometryHeld": False, "uiGeometryMachine": 0,
        "stMagazineStatus.udiProducedPartsTotal": 0, "udiGeometryMagazineCounter": 0,
        "stRobotStatus.xDetailAvailable": False, "stRobotStatus.xGripper2Open": True,
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
        f"axTwinMagazineExchangeInProgress[{magazine}]": False,
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


@pytest.mark.parametrize("magazine", [1, 2])
@pytest.mark.parametrize("phase", ["GEOMETRY_WAIT_FREE", "GEOMETRY_DELIVER", "GEOMETRY_RELEASE_COMMAND"])
def test_geometry_operation_keeps_owner_during_magazine_exchange(magazine, phase):
    values = scheduler_state(magazine, phase)
    values.update({
        f"axMagazineExchangeInProgress[{magazine}]": True,
        "xAlternateMagazineAvailable": True,
    })
    run(owner_decision(magazine), values)
    assert values["uiActiveMagazine"] == magazine
    assert values["eState"] == f"E_CELL_MANAGER_STATE.{phase}"
    assert values["eMagazineOperation"] == "E_MAGAZINE_OPERATION.PUT"


@pytest.mark.parametrize(("overrides", "expected_pending"), [
    ({"GVL_CELL_MANAGER.Status.xStopPending": True}, False),
    ({"GVL_CELL_CONTROL.xStop": True}, False),
    ({"GVL_CELL_CONTROL.xManual": True}, False),
    ({"astTwinCommand[1].xDisable": True}, False),
    ({"astTwinCommand[1].xStop": True}, False),
    ({"GVL_TWO_PALLET.astStatus[1].xError": True}, False),
    ({"GVL_TWO_PALLET.uiMode": 0}, False),
    ({"GVL_TWO_PALLET.astStatus[1].xEnabled": False}, True),
    ({"xTwinAutoSwapEnabled": False}, True),
    ({"xTwinOtherLoaded": False}, True),
])
def test_finished_cell_hold_cancels_only_on_stop_disable_error_or_mode_change(overrides, expected_pending):
    values = scheduler_state(phase="WAIT_MAGAZINE")
    values["axMagazineAutoSwapPending[1]"] = exchange_request(1, overrides)
    assert values["axMagazineAutoSwapPending[1]"] is expected_pending
    run(owner_decision(1), values)
    assert (values["uiActiveMagazine"] == 1) is expected_pending


def start_exchange(robot_swap_window, magazine=1, other_loaded=True):
    overrides = {"xTwinOtherLoaded": other_loaded}
    pending = exchange_request(magazine, overrides)
    request_values = {
        f"axTwinAutoSwapPending[{magazine}]": pending,
        "xTwinAutoSwapEnabled": True,
        "xTwinOtherLoaded": other_loaded,
    }
    source = RUN.replace("[uiTwin]", f"[{magazine}]")
    auto_swap_expression = re.search(r"\bxAutoSwap := (.*?),\n", source, re.S).group(1)
    run(f"xAutoSwap := {auto_swap_expression};", request_values)
    values = {
        "xAutoSwap": request_values["xAutoSwap"],
        "xBase": True, "xIdle": True, "Status.xConfirmed": True,
        "xRobotMagazineReady": True, "uiCandidate": 1, "Status.uiRobotPallet": 1,
        "Input.xPowered": True, "Error.dwErrorActive": 0,
        "xRobotSwapWindow": robot_swap_window, "Status.xEnabled": True, "xOtherLoaded": other_loaded,
        "Output.xStop": False, "xCommandPresent": False,
        "Diag.eState": "E_TWO_PALLET_STATE.IDLE", "xManualExchange": True,
    }
    run(assignment(TWIN, "xEnableBaseAllowed"), values)
    run(assignment(TWIN, "xAutoSwapAllowed"), values)
    start = TWIN.index("IF xAutoSwap\n")
    end = TWIN.index("END_IF;", start) + len("END_IF;")
    run(TWIN[start:end], values)
    return values


def test_exchange_can_start_while_robot_moves_elsewhere_but_not_inside_target_magazine():
    values = {
        "GVL_MAGAZINE.astPartStatus[1].xBusy": False,
        "GVL_MAGAZINE.astPartStatus[1].xDisablePending": False,
        "GVL_MAGAZINE.astAutoCommand[1].xExecute": False,
        "GVL_MAGAZINE.astCommand[1].xExecute": False,
        "GVL_ROBOT.Status.xBusy": True,
        "xMotionBusy": True,
        "GVL_ROBOT.Status.uiMagazineContext": 2,
        "GVL_CELL_MANAGER.Status.uiActiveMagazine": 0,
        "GVL_CELL_MANAGER.Diag.eState": "E_CELL_STATE.IDLE",
        "GVL_ROBOT.Status.xError": False,
        "GVL_ROBOT.Status.eCurrentPoint": "E_POINT_NAME.MAGAZINE_CHANGE",
        "xRobotInterfaceReady": True,
        "uiTwin": 1,
    }
    source = RUN.replace("[uiTwin]", "[1]")
    run(assignment(source, "xTwinRobotOperation"), values)
    run(assignment(source, "xTwinRobotSwapWindow"), values)
    assert not values["xTwinRobotOperation"]
    assert values["xTwinRobotSwapWindow"]
    assert start_exchange(values["xTwinRobotSwapWindow"])["Diag.eState"] == "E_TWO_PALLET_STATE.AUTO_LOWER"

    values["GVL_ROBOT.Status.uiMagazineContext"] = 1
    run(assignment(source, "xTwinRobotOperation"), values)
    run(assignment(source, "xTwinRobotSwapWindow"), values)
    assert values["xTwinRobotOperation"]
    assert not values["xTwinRobotSwapWindow"]


@pytest.mark.parametrize("magazine", [1, 2])
def test_exchange_lock_releases_owner_to_other_ready_magazine(magazine):
    values = scheduler_state(magazine, phase="WAIT_MAGAZINE")
    other_magazine = 3 - magazine
    values.update({
        f"axMagazineExchangeInProgress[{magazine}]": True,
        f"astMagazineStatus[{magazine}].xBusy": True,
        "xAlternateMagazineAvailable": True,
    })
    run(owner_decision(magazine), values)
    assert values["uiActiveMagazine"] == other_magazine
    assert values["eState"] == "E_CELL_MANAGER_STATE.PLAN_TARGET"


def test_unconfirmed_load_keeps_cell_waiting_without_starting_exchange():
    pending = exchange_request(1, {"xTwinOtherLoaded": False})
    assert pending  # The cell holds its cycle while the operator loads the other pallet.
    assert not start_exchange(True, other_loaded=False)["xAutoSwap"]

    values = scheduler_state(phase="WAIT_MAGAZINE")
    values.update({
        "xRunning": True,
        "xActiveMagazineAutoSwapPending": pending,
        "xStopRequested": False,
        "stRobotStatus.xBlankAvailable": False,
        "stRobotStatus.xDetailAvailable": False,
        "stRobotStatus.xBusy": False,
        "stMagazineStatus.xError": False,
    })
    plan_body = state_body(MANAGER, "E_CELL_MANAGER_STATE.PLAN_TARGET")
    empty_plan = plan_body.index("\n\t\tELSE\n\t\t\tuiBlankPayloadType := UINT#0;")
    empty_plan_body = plan_body[empty_plan + len("\n\t\tELSE\n"):].rsplit("\n\t\tEND_IF;", 1)[0]
    empty_plan_body = empty_plan_body.replace("SelectMachineBeforeTake()", "UINT#0")
    empty_plan_body = empty_plan_body.replace("SelectMachineForUnload(uiCurrentMachine := UINT#0)", "UINT#0")
    values["eState"] = "E_CELL_MANAGER_STATE.PLAN_TARGET"
    run(empty_plan_body, values)
    assert values["eState"] == "E_CELL_MANAGER_STATE.WAIT_MAGAZINE"
    assert values["xRunning"]

    wait_body = state_body(MANAGER, "E_CELL_MANAGER_STATE.WAIT_MAGAZINE")
    empty_gripper = wait_body.index("\n\t\tELSE\n\t\t\tuiCandidateMachine := SelectMachineBeforeTake();")
    empty_gripper_end = wait_body.index("\n\t\tEND_IF;", empty_gripper)
    empty_gripper_plan = wait_body[empty_gripper + len("\n\t\tELSE\n"):empty_gripper_end]
    empty_gripper_plan = empty_gripper_plan.replace("SelectMachineBeforeTake()", "UINT#0")
    empty_gripper_plan = empty_gripper_plan.replace("SelectMachineForUnload(uiCurrentMachine := uiSelectedMachine)", "UINT#0")
    run(empty_gripper_plan, values)
    assert values["xRunning"]
    assert values["eState"] == "E_CELL_MANAGER_STATE.WAIT_MAGAZINE"


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

    # The target is excluded through its final Completed scan; the cycle releases
    # ownership at the boundary instead of stopping all robot routes globally.
    values[f"axMagazineExchangeInProgress[{magazine}]"] = True
    values[f"astMagazineStatus[{magazine}].xBusy"] = True
    run(owner_decision(magazine), values)
    assert values["xRunning"] and values["uiActiveMagazine"] == 0
    assert values["eState"] == "E_CELL_MANAGER_STATE.WAIT_MAGAZINE"

    # After the bank refresh, the real empty-gripper planner chooses machine 3.
    values.update({
        f"astMagazineStatus[{magazine}].xFinished": False,
        f"axMagazineAutoSwapPending[{magazine}]": False,
        f"axMagazineExchangeInProgress[{magazine}]": False,
        "stMagazineStatus.xFinished": False, "xActiveMagazineAutoSwapPending": False,
        "xMagazine1Available": magazine == 1, "xMagazine2Available": magazine == 2,
        "xMagazineReady": True, "candidate_before_take": 3,
        "candidate_for_unload": 0, "Config.auiMachineType[3]": 1,
        "stMagazineStatus.stTypeStatus.aiBlankSlot[1]": 1,
    })
    select_available = MANAGER[MANAGER.index("IF (uiActiveMagazine < UINT#1)"):
                               MANAGER.index("\nIF (uiActiveMagazine >= UINT#1)", MANAGER.index("IF (uiActiveMagazine < UINT#1)"))]
    run(select_available, values)
    assert values["uiActiveMagazine"] == magazine
    run(owner_decision(magazine), values)
    plan_body = state_body(MANAGER, "E_CELL_MANAGER_STATE.PLAN_TARGET")
    start = plan_body.index("\n\t\tELSE\n\t\t\tuiBlankPayloadType := UINT#0;")
    planner = plan_body[start + len("\n\t\tELSE"):].rsplit("END_IF;", 1)[0]
    planner = planner.replace("SelectMachineBeforeTake()", "candidate_before_take")
    planner = planner.replace("SelectMachineForUnload(uiCurrentMachine := UINT#0)", "candidate_for_unload")
    planner = planner.replace("[uiSelectedMachine]", "[3]").replace("[uiSelectedType]", "[1]")
    run(planner, values)
    assert values["xRunning"]
    assert values["eState"] == "E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE"
    assert values["eMagazineOperation"] == "E_MAGAZINE_OPERATION.TAKE"
    assert values["uiSelectedMachine"] == 3
