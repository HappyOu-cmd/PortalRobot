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
        "xReselectMagazine": False, "uiPreferredMagazine": 0,
        "xMagazine1CanExchangeDetail": False, "xMagazine2CanExchangeDetail": False,
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
    changes = re.findall(r"\bxInventoryChanged := (.*?),\n", RUN_MAGAZINE, re.S)
    if changes:
        assert len(changes) == 2
        run("xInventoryChanged := " + changes[magazine - 1] + ";", values)
    reset = re.search(r"IF xInventoryChanged THEN.*?END_IF;", MAGAZINE, re.S)
    if reset:
        run(reset[0], values)
    if values["Diag.eState"] == "E_MAGAZINE_STATE.DISABLED":
        run(state_body(MAGAZINE, "E_MAGAZINE_STATE.DISABLED"), values)
    else:
        idle = state_body(MAGAZINE, "E_MAGAZINE_STATE.IDLE")
        idle = idle[:idle.index("// Активный автоматический цикл")] + "END_IF;"
        run(idle, values)
    run(assignment(MAGAZINE, "Status.xEnabled"), values)
    run(assignment(MAGAZINE, "Status.xBusy"), values)
    latched = re.findall(r"\bxFinishedLatched\s*:=\s*.*?;", MAGAZINE, re.S)
    if latched:
        run(latched[-1], values)
    run(assignment(MAGAZINE, "Status.xFinished"), values)


def magazine_state(magazine, phase="DISABLED"):
    return {
        "xIoManual": False,
        "GVL_TWO_PALLET.uiMode": 1,
        f"GVL_TWO_PALLET.astStatus[{magazine}].xReady": True,
        f"GVL_HMI.astMagazineCommand[{magazine}].xEnable": False,
        f"axTwinMagazineExchangeInProgress[{magazine}]": False,
        f"axMagazineInventoryChanged[{magazine}]": False,
        "xInventoryChanged": False, "xFinishedLatched": True,
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
    values[f"axMagazineInventoryChanged[{magazine}]"] = True
    magazine_scan(values, magazine)
    assert not values["Status.xEnabled"]  # Last scan's Finished still blocks Enable.
    values[f"axMagazineInventoryChanged[{magazine}]"] = False
    magazine_scan(values, magazine)
    assert values["Status.xEnabled"]
    assert not values["Status.xFinished"]


def finished_condition(values):
    start = MAGAZINE.index("xMachineHasRelevantPart := FALSE;")
    loop = re.search(r"FOR uiMachineIndex := UINT#1 TO UINT#3 DO(.*?)END_FOR;",
                     MAGAZINE[start:], re.S)
    assert loop
    bodies = []
    for machine in range(1, 4):
        product = values[f"auiMachineType[{machine}]"]
        bodies.append(loop[1].replace("[uiMachineIndex]", f"[{machine}]")
                      .replace("[uiMachineTypeIndex]", f"[{product}]"))
    run(MAGAZINE[start:start + loop.start()] + "\n".join(bodies), values)
    for target in ("xNoBlankNoMachinePart", "xNoBlankNoDestination", "xFinishedCondition"):
        run(assignment(MAGAZINE, target), values)


def working_pallet_state(magazine):
    values = magazine_state(magazine, "IDLE")
    values.update({
        "Status.xFinished": False, "xFinishedLatched": False,
        "Status.xOutBlank": True, "xAllSlotsDetails": False,
        "stRobotStatus.xBlankAvailable": False,
        "stRobotStatus.xDetailAvailable": False,
    })
    for machine in range(1, 4):
        values[f"auiMachineType[{machine}]"] = machine
        values[f"Status.stTypeStatus.aiFreeSlot[{machine}]"] = 93
        for field, value in {"xEnabled": True, "xError": False, "xProcessing": False,
                             "ePartState": "E_PART_STATE.EMPTY",
                             "ePartType": "E_PART_TYPE.UNKNOWN"}.items():
            values[f"astMachineStatus[{machine}].{field}"] = value
    return values


def finished_pallet_state(magazine):
    values = working_pallet_state(magazine)
    finished_condition(values)
    magazine_scan(values, magazine)
    assert values["Status.xFinished"]
    assert not values["Status.xEnabled"]
    return values


def bank_change(magazine, before, after, completed=False):
    values = {
        "uiTwinRobotPalletBefore": before,
        f"GVL_TWO_PALLET.astStatus[{magazine}].uiRobotPallet": after,
        f"GVL_TWO_PALLET.astStatus[{magazine}].xCompleted": completed,
        f"axMagazineInventoryChanged[{magazine}]": False,
        f"GVL_TWO_PALLET.astStore[{magazine}].axLoaded[1]": True,
        f"GVL_TWO_PALLET.astStore[{magazine}].axLoaded[2]": True,
    }
    start = RUN.index("\tIF GVL_TWO_PALLET.astStatus[uiTwin].xCompleted THEN")
    end = RUN.index("\t// Ручная смена", start)
    run(RUN[start:end].replace("[uiTwin]", f"[{magazine}]"), values)
    return values[f"axMagazineInventoryChanged[{magazine}]"]


@pytest.mark.parametrize("magazine", [1, 2])
@pytest.mark.parametrize("remaining", ["blank", "detail", "machine"])
def test_pallet_does_not_finish_before_its_last_payload_or_machine_return(magazine, remaining):
    values = working_pallet_state(magazine)
    values["stRobotStatus.xBlankAvailable"] = remaining == "blank"
    values["stRobotStatus.xDetailAvailable"] = remaining == "detail"
    values["astMachineStatus[1].xProcessing"] = remaining == "machine"
    for _ in range(10):
        finished_condition(values)
        magazine_scan(values, magazine)
        assert not values["Status.xFinished"]
        assert values["Status.xEnabled"]
    values["stRobotStatus.xBlankAvailable"] = False
    values["stRobotStatus.xDetailAvailable"] = False
    values["astMachineStatus[1].xProcessing"] = False
    finished_condition(values)
    magazine_scan(values, magazine)
    assert values["Status.xFinished"]
    assert not values["Status.xEnabled"]


@pytest.mark.parametrize("magazine", [1, 2])
@pytest.mark.parametrize("peer_work", ["blank", "detail", "both", "machine"])
def test_finished_pallet_stays_closed_when_other_magazine_starts(magazine, peer_work):
    values = finished_pallet_state(magazine)
    values["stRobotStatus.xBlankAvailable"] = peer_work in ("blank", "both")
    values["stRobotStatus.xDetailAvailable"] = peer_work in ("detail", "both")
    values["astMachineStatus[1].xProcessing"] = peer_work == "machine"
    values["astMachineStatus[1].ePartState"] = "E_PART_STATE.LOADED"
    values["astMachineStatus[1].ePartType"] = "E_PART_TYPE.PART"
    for _ in range(80):
        finished_condition(values)
        assert not values["xFinishedCondition"]
        magazine_scan(values, magazine)
        assert values["Status.xFinished"]
        assert not values["Status.xEnabled"]
        assert not values["enable"]
    assert exchange_request(magazine, {"xTwinOtherLoaded": False})
    assert start_exchange(True, magazine, other_loaded=False)["Diag.eState"] == "E_TWO_PALLET_STATE.IDLE"
    assert start_exchange(True, magazine)["Diag.eState"] == "E_TWO_PALLET_STATE.AUTO_LOWER"


@pytest.mark.parametrize("magazine", [1, 2])
@pytest.mark.parametrize("command", [20, 21, 22, 23])
@pytest.mark.parametrize("active", [False, True])
@pytest.mark.parametrize("accepted", [False, True])
def test_pallet_edit_resets_only_the_accepted_active_bank(magazine, command, active, accepted):
    values = finished_pallet_state(magazine)
    values.update({
        "uiTwinRequestResult": 1 if accepted else 2,
        "stTwinRequest.uiCommand": command,
        "uiTwinPallet": 2 if active else 1,
        f"GVL_TWO_PALLET.astStatus[{magazine}].uiRobotPallet": 2,
    })
    decision = re.search(r"IF \(uiTwinRequestResult = UINT#1\).*?END_IF;", RUN, re.S)
    if decision:
        run(decision[0].replace("[uiTwin]", f"[{magazine}]"), values)
    # The new machine work removes the instantaneous completion condition.
    values["astMachineStatus[1].xProcessing"] = True
    finished_condition(values)
    magazine_scan(values, magazine)
    changed = accepted and active and command in (21, 22, 23)
    assert values["Status.xFinished"] is (not changed)
    assert values[f"axMagazineInventoryChanged[{magazine}]"] is changed


@pytest.mark.parametrize("magazine", [1, 2])
@pytest.mark.parametrize(("after", "completed", "changed"), [
    (1, False, False),  # Waiting, start, failure and reconfirmation of the same role.
    (2, False, True),   # A different role explicitly confirmed after recovery.
    (2, True, True),    # Exchange completed; only now has the working bank changed.
])
def test_finished_resets_only_when_its_working_bank_changes(magazine, after, completed, changed):
    values = finished_pallet_state(magazine)
    values["stRobotStatus.xBlankAvailable"] = True  # The robot works with the peer.
    finished_condition(values)
    values[f"axMagazineInventoryChanged[{magazine}]"] = bank_change(magazine, 1, after, completed)
    magazine_scan(values, magazine)
    assert values["Status.xFinished"] is (not changed)
    if changed:
        values[f"axMagazineInventoryChanged[{magazine}]"] = False
        magazine_scan(values, magazine)
        assert values["Status.xEnabled"]


@pytest.mark.parametrize("magazine", [1, 2])
def test_peer_swap_then_own_loading_swaps_only_the_finished_pallet(magazine):
    peer = 3 - magazine
    own_values = finished_pallet_state(magazine)
    peer_values = finished_pallet_state(peer)
    assert start_exchange(True, peer)["Diag.eState"] == "E_TWO_PALLET_STATE.AUTO_LOWER"
    peer_values[f"axMagazineInventoryChanged[{peer}]"] = bank_change(peer, 1, 2, completed=True)
    peer_values["xFinishedCondition"] = False  # The peer's new bank contains blanks.
    magazine_scan(peer_values, peer)
    assert not peer_values["Status.xFinished"]
    assert own_values["Status.xFinished"]

    # The peer starts machining; filling/confirming our operator pallet cannot
    # resurrect the finished 92-detail / 4-free-slot working pallet.
    own_values["astMachineStatus[1].xProcessing"] = True
    own_values["stRobotStatus.xBlankAvailable"] = True
    finished_condition(own_values)
    magazine_scan(own_values, magazine)
    assert own_values["Status.xFinished"] and not own_values["Status.xEnabled"]
    assert start_exchange(True, magazine, other_loaded=False)["Diag.eState"] == "E_TWO_PALLET_STATE.IDLE"
    assert start_exchange(True, magazine)["Diag.eState"] == "E_TWO_PALLET_STATE.AUTO_LOWER"
    assert not start_exchange(False, magazine)["xAutoSwapAllowed"]

    own_values[f"axMagazineInventoryChanged[{magazine}]"] = bank_change(magazine, 1, 1)
    magazine_scan(own_values, magazine)
    assert own_values["Status.xFinished"]  # The exchange has only started.
    own_values[f"axMagazineInventoryChanged[{magazine}]"] = bank_change(magazine, 1, 2, completed=True)
    magazine_scan(own_values, magazine)
    assert not own_values["Status.xFinished"]


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
        "xRobotMagazineReady": True, "xPointsConfigured": True,
        "uiCandidate": 1, "Status.uiRobotPallet": 1,
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

# Replay the complete magazine choice, including availability, stock and handoff.
ELIGIBLE = read("FB/FB_CELL_MANAGER/FB_CELL_MANAGER.IsMachineEligible.st")


def magazine_selection(values):
    source = MANAGER[MANAGER.index("xMagazine1Available :="):
                     MANAGER.index("\nIF (uiActiveMagazine >= UINT#1)")]
    source = source.replace("[uiActiveMagazine]", f"[{values['uiActiveMagazine']}]")
    source = source.replace("[uiDetailPayloadType]", f"[{values['uiDetailPayloadType']}]")
    loop = re.search(r"FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO(.*?)END_FOR;", source, re.S)
    while loop:
        unfolded = []
        for machine in range(1, 4):
            values["uiMachine"] = machine
            eligible = ELIGIBLE.split("// --- BEGIN IMPLEMENTATION ---", 1)[1]
            run(eligible.replace("[uiMachine]", f"[{machine}]"), values)
            values[f"selection_machine_{machine}_eligible"] = values["IsMachineEligible"]
            body = loop[1].replace("IsMachineEligible(uiMachine := uiMachine)",
                                   f"selection_machine_{machine}_eligible")
            body = body.replace("[uiMachine]", f"[{machine}]")
            body = body.replace("[uiMagazineType]", f"[{values[f'Config.auiMachineType[{machine}]']}]")
            unfolded.append(body)
        source = source[:loop.start()] + "\n".join(unfolded) + source[loop.end():]
        loop = re.search(r"FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO(.*?)END_FOR;", source, re.S)
    run(source, values)


def magazine_selection_state(magazine=2, phase="PLAN_TARGET"):
    values = scheduler_state(magazine, phase)
    values.update({
        "xRunning": phase != "IDLE",
        "stRobotStatus.xBlankAvailable": False,
        "stRobotStatus.xDetailAvailable": False,
        "stRobotStatus.xGripper1Open": True,
        "uiBlankPayloadType": 1,
        "uiDetailPayloadType": 1, "Config.uiTypeCount": 3,
        "FIRST_MACHINE": 1, "LAST_MACHINE": 3,
        "iTakeSlot": 5, "iPutSlot": 6, "iTakeOriginSlot": 5,
    })
    for index in (1, 2):
        for field, value in {"xEnabled": True, "xReady": True, "xBusy": False,
                             "xError": False, "xDisablePending": False, "xFinished": False}.items():
            values[f"astMagazineStatus[{index}].{field}"] = value
        values[f"axMagazineAutoSwapPending[{index}]"] = False
        values[f"axMagazineExchangeInProgress[{index}]"] = False
        for product in range(1, 4):
            values[f"astMagazineStatus[{index}].stTypeStatus.aiBlankSlot[{product}]"] = 1
            values[f"astMagazineStatus[{index}].stTypeStatus.aiFreeSlot[{product}]"] = 2
    for machine in range(1, 4):
        values[f"Config.auiMachineType[{machine}]"] = 1
        values[f"axMachineStartPending[{machine}]"] = False
        values[f"axGeometryUnloadBlocked[{machine}]"] = False
        for field, value in {"xEnabled": machine == 1, "xError": False, "xDisablePending": False,
                             "xProcessing": False, "xCanAcceptService": True,
                             "xServiceRequired": False,
                             "ePartState": "E_PART_STATE.EMPTY", "ePartType": "E_PART_TYPE.NONE"}.items():
            values[f"astMachineStatus[{machine}].{field}"] = value
    return values


@pytest.mark.parametrize("magazine", [1, 2])
def test_finished_pallet_with_free_slots_is_not_a_detail_destination(magazine):
    values = magazine_selection_state(magazine)
    peer = 3 - magazine
    values.update({
        f"astMagazineStatus[{magazine}].xFinished": True,
        f"astMagazineStatus[{magazine}].stTypeStatus.aiBlankSlot[1]": 0,
        f"astMagazineStatus[{peer}].xEnabled": False,
        "stMagazineStatus.xEnabled": True, "stMagazineStatus.xReady": True,
        "stMagazineStatus.xFinished": True, "stMagazineStatus.xDisablePending": False,
        "xActiveMagazineExchangeInProgress": False,
    })
    start = MANAGER.index("xAnyMagazineDetailSlotAvailable := FALSE;")
    end = MANAGER.index("// WARNING: место требуется", start)
    source = MANAGER[start:end].replace("[uiDetailPayloadType]", "[1]")
    loop = re.search(r"FOR uiMagazineIndex := .*? DO(.*?)END_FOR;", source, re.S)
    assert loop
    source = source[:loop.start()] + "\n".join(
        loop[1].replace("[uiMagazineIndex]", f"[{index}]") for index in (1, 2)
    ) + source[loop.end():]
    run(source, values)
    run(assignment(MANAGER, "xMagazineReady"), values)
    assert not values["xAnyMagazineDetailSlotAvailable"]
    assert not values["xMagazineReady"]
    magazine_selection(values)
    assert not values[f"xMagazine{magazine}Available"]

    values[f"astMagazineStatus[{magazine}].xFinished"] = False
    values["stMagazineStatus.xFinished"] = False
    values["uiActiveMagazine"] = magazine  # The refreshed bank can be selected again.
    run(source, values)
    run(assignment(MANAGER, "xMagazineReady"), values)
    assert values["xAnyMagazineDetailSlotAvailable"]
    assert values["xMagazineReady"]


@pytest.mark.parametrize("phase", ["PLAN_TARGET", "WAIT_TARGET", "SELECT_FALLBACK", "WAIT_MAGAZINE"])
def test_first_magazine_priority_returns_at_planning_boundaries(phase):
    values = magazine_selection_state(phase=phase)
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 1
    assert values["eState"] == "E_CELL_MANAGER_STATE.PLAN_TARGET"
    assert values["xRunning"]
    assert values["eMagazineOperation"] == "E_MAGAZINE_OPERATION.NONE"
    assert values["eMachineOperation"] == "E_MACHINE_OPERATION.NONE"
    assert [values[name] for name in ("uiSelectedMachine", "uiSelectedType", "iTakeSlot", "iPutSlot", "iTakeOriginSlot")] == [0] * 5


def test_first_magazine_priority_is_applied_before_new_start():
    values = magazine_selection_state(phase="IDLE")
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 1
    assert values["eState"] == "E_CELL_MANAGER_STATE.IDLE"
    assert not values["xRunning"]


@pytest.mark.parametrize("magazine", [1, 2])
def test_finished_magazine_waiting_for_pallet_does_not_block_other_stock(magazine):
    values = magazine_selection_state(magazine, "WAIT_MAGAZINE")
    values[f"astMagazineStatus[{magazine}].xFinished"] = True
    values[f"axMagazineAutoSwapPending[{magazine}]"] = True
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 3 - magazine
    assert values["xRunning"]
    assert values["eState"] == "E_CELL_MANAGER_STATE.PLAN_TARGET"
    assert values[f"axMagazineAutoSwapPending[{magazine}]"]


@pytest.mark.parametrize("phase", [
    "MAGAZINE_EXECUTE", "RELEASE_MAGAZINE", "ROUTE_TO_TARGET", "RELEASE_ROBOT_COMMAND",
    "SERVICE_TARGET", "PRESTART_IDENTIFY", "WAIT_GRIPPER1_CONTENT", "WAIT_GRIPPER1_TYPE",
    "WAIT_GRIPPER2_CONTENT", "WAIT_GRIPPER2_TYPE", "WAIT_START_MACHINE", "ERROR",
    "MACHINE_FAULT_STOP", "TEST_ABORT_STOP", "GEOMETRY_WAIT_FREE", "GEOMETRY_DELIVER",
    "GEOMETRY_RELEASE_COMMAND",
])
def test_magazine_priority_keeps_issued_route_and_geometry_phases(phase):
    values = magazine_selection_state(phase=phase)
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2
    assert values["eState"] == f"E_CELL_MANAGER_STATE.{phase}"
    assert values["iTakeOriginSlot"] == 5


@pytest.mark.parametrize("busy", ["stRobotStatus.xBusy", "astMagazineStatus[2].xBusy"])
def test_magazine_priority_waits_for_current_operation_to_release(busy):
    values = magazine_selection_state()
    values[busy] = True
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2
    assert values["iTakeOriginSlot"] == 5


@pytest.mark.parametrize("both_payloads", [False, True])
def test_magazine_priority_preserves_held_blank_origin(both_payloads):
    values = magazine_selection_state(phase="SELECT_FALLBACK")
    values["stRobotStatus.xBlankAvailable"] = True
    values["stRobotStatus.xDetailAvailable"] = both_payloads
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2
    assert values["iTakeOriginSlot"] == 5


@pytest.mark.parametrize("field,value", [
    ("xEnabled", False), ("xReady", False), ("xBusy", True), ("xError", True),
    ("xDisablePending", True), ("xFinished", True), ("exchange", True),
])
def test_magazine_priority_skips_unavailable_first_magazine(field, value):
    values = magazine_selection_state()
    name = "axMagazineExchangeInProgress[1]" if field == "exchange" else f"astMagazineStatus[1].{field}"
    values[name] = value
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2


@pytest.mark.parametrize("product", [1, 2, 3])
def test_magazine_priority_requires_free_slot_for_held_detail(product):
    values = magazine_selection_state(magazine=1)
    values["stRobotStatus.xDetailAvailable"] = True
    values["stRobotStatus.xGripper1Open"] = False  # No safe TAKE before PUT.
    values["uiDetailPayloadType"] = product
    values[f"astMagazineStatus[1].stTypeStatus.aiFreeSlot[{product}]"] = 0
    for _ in range(3):
        magazine_selection(values)
        assert values["uiActiveMagazine"] == 2
    values[f"astMagazineStatus[1].stTypeStatus.aiFreeSlot[{product}]"] = 4
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 1


@pytest.mark.parametrize("product", [0, 4])
def test_magazine_priority_does_not_index_unknown_detail_type(product):
    values = magazine_selection_state()
    values["stRobotStatus.xDetailAvailable"] = True
    values["uiDetailPayloadType"] = product
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2


@pytest.mark.parametrize("first_blank_type", [None, 2])
def test_magazine_selection_uses_stock_compatible_with_enabled_machine(first_blank_type):
    values = magazine_selection_state(magazine=1, phase="WAIT_TARGET")
    for product in range(1, 4):
        values[f"astMagazineStatus[1].stTypeStatus.aiBlankSlot[{product}]"] = int(product == first_blank_type)
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2
    assert values["eState"] == "E_CELL_MANAGER_STATE.PLAN_TARGET"
    assert values["xRunning"]


@pytest.mark.parametrize("pending", ["processing", "start", "part", "detail"])
def test_magazine_selection_keeps_first_destination_for_machine_work(pending):
    values = magazine_selection_state()
    values["astMagazineStatus[1].stTypeStatus.aiBlankSlot[1]"] = 0
    values["astMagazineStatus[2].stTypeStatus.aiBlankSlot[1]"] = 0
    if pending == "processing":
        values["astMachineStatus[1].xProcessing"] = True
    elif pending == "start":
        values["axMachineStartPending[1]"] = True
    else:
        values["astMachineStatus[1].ePartState"] = "E_PART_STATE.LOADED"
        values["astMachineStatus[1].ePartType"] = "E_PART_TYPE." + ("PART" if pending == "part" else "DETAIL")
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 1


def test_magazine_selection_waits_if_neither_magazine_can_continue():
    values = magazine_selection_state(phase="WAIT_MAGAZINE")
    for magazine in (1, 2):
        for product in range(1, 4):
            values[f"astMagazineStatus[{magazine}].stTypeStatus.aiBlankSlot[{product}]"] = 0
    for _ in range(3):
        magazine_selection(values)
        assert values["uiActiveMagazine"] == 2
        assert values["eState"] == "E_CELL_MANAGER_STATE.WAIT_MAGAZINE"
        assert values["xRunning"]


def test_magazine_selection_rechecks_first_after_reenable_and_pallet_exchange():
    values = magazine_selection_state(phase="MAGAZINE_EXECUTE")
    values["astMagazineStatus[1].xEnabled"] = False
    magazine_selection(values)
    values["astMagazineStatus[1].xEnabled"] = True
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2
    values["eState"] = "E_CELL_MANAGER_STATE.PLAN_TARGET"
    values["axMagazineExchangeInProgress[1]"] = True
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2
    values["axMagazineExchangeInProgress[1]"] = False
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 1

@pytest.mark.parametrize("magazine", [0, 1, 2])
def test_magazine_selection_initial_owner_has_first_priority(magazine):
    values = magazine_selection_state(magazine)
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 1


def test_magazine_selection_takes_second_stock_before_waiting_for_first_unload():
    values = magazine_selection_state(magazine=1, phase="WAIT_TARGET")
    values["astMagazineStatus[1].stTypeStatus.aiBlankSlot[1]"] = 0
    values["astMachineStatus[1].xProcessing"] = True
    values["astMachineStatus[2].xEnabled"] = True
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2
    assert values["xRunning"]
    assert values["eState"] == "E_CELL_MANAGER_STATE.PLAN_TARGET"


@pytest.mark.parametrize("field,value", [
    ("xEnabled", False), ("xError", True), ("xDisablePending", True), ("type", 0), ("type", 4),
])
def test_magazine_selection_does_not_take_stock_for_excluded_machine(field, value):
    values = magazine_selection_state(magazine=1, phase="WAIT_TARGET")
    for magazine in (1, 2):
        for product in range(1, 4):
            values[f"astMagazineStatus[{magazine}].stTypeStatus.aiBlankSlot[{product}]"] = int(product == magazine)
    values["astMachineStatus[2].xEnabled"] = True
    values["Config.auiMachineType[2]"] = 2
    name = "Config.auiMachineType[1]" if field == "type" else f"astMachineStatus[1].{field}"
    values[name] = value
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 2


def test_waiting_second_magazine_replans_actual_take_without_disable_or_start():
    values = magazine_selection_state(phase="WAIT_MAGAZINE")
    values.update({
        "astMagazineStatus[2].xFinished": True,
        "axMagazineAutoSwapPending[2]": True,
        "astMagazineStatus[2].stTypeStatus.aiBlankSlot[1]": 0,
        "astMagazineStatus[1].stTypeStatus.aiBlankSlot[1]": 14,
    })
    magazine_selection(values)
    assert values["uiActiveMagazine"] == 1 and values["xRunning"]

    # Execute the real ready-machine part of SelectMachineBeforeTake with the
    # selected magazine snapshot, then the actual empty-gripper PLAN_TARGET.
    values["SelectMachineBeforeTake"] = 0
    values["stMagazineStatus.stTypeStatus.aiBlankSlot[1]"] = 14
    before_take = read("FB/FB_CELL_MANAGER/FB_CELL_MANAGER.SelectMachineBeforeTake.st")
    loop = re.search(r"FOR uiMachine := FIRST_MACHINE TO LAST_MACHINE DO(.*?)END_FOR;", before_take, re.S)
    assert loop
    for machine in range(1, 4):
        values["uiMachine"] = machine
        body = loop[1].replace("[uiMachine]", f"[{machine}]").replace("[uiType]", "[1]")
        body = body.replace("IsMachineEligible(uiMachine := uiMachine)", f"selection_machine_{machine}_eligible")
        run(body, values)
    values["candidate_before_take"] = values["SelectMachineBeforeTake"]
    assert values["candidate_before_take"] == 1
    values["candidate_for_unload"] = 0
    values["xMagazineReady"] = True
    values["stMagazineStatus.xFinished"] = False
    planner = state_body(MANAGER, "E_CELL_MANAGER_STATE.PLAN_TARGET")
    start = planner.index("\n\t\tELSE\n\t\t\tuiBlankPayloadType := UINT#0;")
    planner = planner[start + len("\n\t\tELSE"):].rsplit("END_IF;", 1)[0]
    planner = planner.replace("SelectMachineBeforeTake()", "candidate_before_take")
    planner = planner.replace("SelectMachineForUnload(uiCurrentMachine := UINT#0)", "candidate_for_unload")
    planner = planner.replace("[uiSelectedMachine]", "[1]").replace("[uiSelectedType]", "[1]")
    run(planner, values)
    assert values["eState"] == "E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE"
    assert values["eMagazineOperation"] == "E_MAGAZINE_OPERATION.TAKE"
    assert values["iTakeSlot"] == values["iTakeOriginSlot"] == 14
    assert values["uiSelectedMachine"] == 1
    assert values["xRunning"]
