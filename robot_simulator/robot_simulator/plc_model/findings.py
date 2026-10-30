"""Minimal source-executed reproductions of the registered PLC defects."""
from __future__ import annotations

from .cell import Cell, Machine, global_record
from .st_runtime import Block


def actual_machine(cell, index=1):
    """Run FB_MACHINE against safe stationary I/O, including its real timers."""
    r = cell.registry
    block = Block(r, "FB/FB_MACHINE.st", cell.manager.state)
    settings = global_record(r, "GVL/GVL_CELL_SETTINGS.gvl.st", cell.g, {"stMachineTimeouts"})
    block.stTimeouts = settings.stMachineTimeouts
    block.xPointsConfigured = block.xAutomaticUseEnabled = True
    block.stMachineStatus.xSafetyDoorClosed = block.stMachineStatus.xDoorClosed = True
    block.stMachineStatus.xHatchLocked = block.stMachineStatus.xChuckClamped = True
    block.stRobotStatus = cell.robot
    block.stPoints.eAbove = getattr(r.enums["E_POINT_NAME"], f"MACHINE_{index}_ABOVE")
    block()
    return block


def start_ignores_other_magazine():
    cell = Cell(types=2, machines=[Machine("disabled", 1), Machine("empty", 2), Machine("disabled", 1)],
                magazines=[[1] * 4, [2] * 4])
    # Repeated Start does not resolve the selected enabled, incompatible M1.
    cell.run(3)
    cell.start()
    return cell, {"id": "F001", "expected": "Start selects magazine 2 and starts the available type-2 work",
                  "observed": cell.snapshot(), "violation": not cell.manager.xRunning,
                  "trace": cell.trace[-8:]}


def unready_machine_starves_other_magazine():
    cell = Cell(types=2, machines=[Machine("done", 1), Machine("empty", 2), Machine("disabled", 1)],
                magazines=[[1] * 4, [2] * 4])
    block = actual_machine(cell)
    block(xHmiEnable=True)
    block(xHmiEnable=False, xHmiSetBlank=True)
    block.xHmiSetBlank = False
    assert block.eState == cell.registry.enums["E_MACHINE_STATE"].OPERATOR_CHOICE_RUN
    assert block.Status.xEnabled and not block.Status.xBusy and not block.Status.xProcessing
    assert not block.Status.xCanAcceptService and not block.Status.xError
    cell.manager.astMachineStatus[1] = block.Status
    cell.run(32)
    return cell, {"id": "F002", "expected": "Available type-2 work in magazine 2 progresses while machine 1 waits for its operator",
                  "observed": cell.snapshot(), "violation": not cell.operations,
                  "machine_status_from": "FB_MACHINE, OPERATOR_CHOICE_RUN", "trace": cell.trace[-8:]}


def unload_rejection_becomes_magazine_error():
    cell = Cell(machines=[Machine("done"), Machine("disabled"), Machine("disabled")],
                magazines=[[0] * 4, [0] * 4], enabled=(True, False))
    for _ in range(32):
        if cell.manager.eState == cell.registry.enums["E_CELL_MANAGER_STATE"].SERVICE_TARGET:
            break
        cell.scan()
    assert cell.manager.eMachineOperation == cell.registry.enums["E_MACHINE_OPERATION"].UNLOAD
    block = actual_machine(cell)
    recipes = global_record(cell.registry, "GVL/GVL_CELL_SETTINGS.gvl.st", cell.g, {"UNLOAD_MACHINE"})
    block.stUnloadRecipe = recipes.UNLOAD_MACHINE
    block.stRobotStatus.eCurrentPoint = block.stPoints.eAbove
    block(xTestInitialize=True, uiTestInitialState=3)
    block.xTestInitialize = False
    block.xExecute = True
    for _ in range(4):
        block()
    assert block.eState == cell.registry.enums["E_MACHINE_STATE"].DOOR_OPEN
    # The lock has opened; only the robot hatch fails to open.
    block.stMachineStatus.xHatchLocked = False
    block()
    cell.clock.now += block.stTimeouts.tDoorOpen + 1
    block()
    assert block.Status.xServiceRejected and block.Status.xError and not block.Status.xCriticalError
    cell.manager.astMachineStatus[1] = block.Status
    cell.service_jobs.clear()
    trace = [cell.snapshot()]
    for _ in range(8):
        cell.manager(); trace.append(cell.snapshot())
    return cell, {"id": "F003", "expected": "The local machine door timeout excludes that machine without inventing a magazine fault",
                  "observed": cell.snapshot(), "violation": bool(cell.manager.Error.dwErrorActive & cell.manager.ERR_MAGAZINE),
                  "primary_machine_error": block.Error.dwErrorActive, "trace": trace}


REPRODUCTIONS = {"F001": start_ignores_other_magazine, "F002": unready_machine_starves_other_magazine,
                 "F003": unload_rejection_becomes_magazine_error}
