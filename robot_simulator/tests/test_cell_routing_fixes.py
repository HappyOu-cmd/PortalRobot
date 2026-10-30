"""Routing admission and fallback regressions, executing production ST."""
from itertools import product

import pytest

from robot_simulator.plc_model.cell import Cell, Machine
from robot_simulator.plc_model.st_runtime import Registry


@pytest.fixture(scope="module")
def registry():
    return Registry()


@pytest.mark.parametrize("mode,roles,machine_index,supply,types", list(product(
    (0, 1), ((1, 1), (1, 2), (2, 1), (2, 2)), (0, 1, 2), (1, 2), (2, 3))))
def test_start_uses_the_only_magazine_with_a_compatible_machine(registry, mode, roles, machine_index, supply, types):
    machines = [Machine("empty" if i == machine_index else "disabled", types) for i in range(3)]
    stocks = [[1] * 4, [1] * 4]
    stocks[supply - 1] = [types] * 4
    c = Cell(types=types, mode=mode, roles=roles, slots=4, registry=registry,
             machines=machines, magazines=stocks)
    assert c.manager.xRunning and c.manager.uiActiveMagazine == supply, c.snapshot()
    c.run(20)
    assert c.operations and not c.manager.Error.dwErrorActive, c.snapshot()


@pytest.mark.parametrize("phase,free,timed", list(product(
    ("operator_blank", "operator_detail", "processing", "pending", "transition", "done_transition"),
    (False, True), (False, True))))
def test_useful_work_and_selectors_agree_without_operator_wait_starvation(registry, phase, free, timed):
    # 'timed' selects the time-estimate variant; admission itself must not
    # depend on whether the previous cycle has a measured duration.
    c = Cell(types=2, registry=registry, autostart=False,
             machines=[Machine("unready", 1, timed=timed), Machine("empty", 2), Machine("disabled", 1)],
             magazines=[[1, 0, 0, 0] if free else [1] * 4, [2] * 4])
    m, s = c.manager, c.manager.astMachineStatus[1]
    m.xRunning = True
    m.uiActiveMagazine = m.uiSupplyMagazine = 1
    m.eState = registry.enums["E_CELL_MANAGER_STATE"].PLAN_TARGET
    s.ePartType = registry.enums["E_PART_TYPE"].DETAIL if phase in ("operator_detail", "done_transition") else registry.enums["E_PART_TYPE"].PART
    s.xProcessing = phase == "processing"
    s.xBusy = phase == "transition"
    s.xDone = phase == "done_transition"
    m.axMachineStartPending[1] = phase == "pending"
    m()
    should_wait = phase not in ("operator_blank", "operator_detail")
    assert m.uiActiveMagazine == (1 if should_wait else 2)
    for index in (1, 2):
        before = (m.uiActiveMagazine, m.uiSupplyMagazine, m.uiReturnMagazine,
                  m.uiSelectedMachine, m.uiSelectedType, m.iTakeOriginSlot)
        supply = m.HasMagazineWork(uiMagazine=index, xSupplyBlankOnly=True)
        any_work = m.HasMagazineWork(uiMagazine=index, xSupplyBlankOnly=False)
        assert before == (m.uiActiveMagazine, m.uiSupplyMagazine, m.uiReturnMagazine,
                          m.uiSelectedMachine, m.uiSelectedType, m.iTakeOriginSlot)
        m.stMagazineStatus = m.astMagazineStatus[index]
        assert supply == bool(m.SelectMachineBeforeTake())
        assert any_work == bool(m.SelectMachineBeforeTake() or m.SelectMachineForUnload(uiCurrentMachine=0))


@pytest.mark.parametrize("held", ((0, 0), (1, 0), (0, 1), (1, 1)))
def test_magazine_probe_does_not_change_payload_return_owner_or_inventory(registry, held):
    c = Cell(registry=registry, autostart=False)
    c.hold(*held)
    m = c.manager
    m.uiActiveMagazine, m.uiSupplyMagazine, m.uiReturnMagazine = 2, 2, 1
    slots = [[(s.xInPosition, s.uiProductType, s.eDetailType) for s in b.stInventory.aSlots.values]
             for b in c.magazines]
    payload = (c.robot.xBlankAvailable, c.robot.xDetailAvailable, c.robot.uiBlankPayloadType, c.robot.uiDetailPayloadType)
    for index in (0, 1, 2, 3, 65535):
        for supply_only in (False, True):
            m.HasMagazineWork(uiMagazine=index, xSupplyBlankOnly=supply_only)
    assert (m.uiActiveMagazine, m.uiSupplyMagazine, m.uiReturnMagazine) == (2, 2, 1)
    assert payload == (c.robot.xBlankAvailable, c.robot.xDetailAvailable, c.robot.uiBlankPayloadType, c.robot.uiDetailPayloadType)
    assert slots == [[(s.xInPosition, s.uiProductType, s.eDetailType) for s in b.stInventory.aSlots.values]
                     for b in c.magazines]


@pytest.mark.parametrize("held,operation,rejected,release_signal", list(product(
    ((0, 0), (1, 0), (0, 1), (1, 1)), ("LOAD", "UNLOAD", "CHANGE"),
    (False, True), ("busy", "done", "motion"))))
def test_service_failure_releases_robot_then_replans_actual_payload(registry, held, operation, rejected, release_signal):
    c = Cell(registry=registry, autostart=False, machines=[Machine("disabled")] * 3)
    c.hold(*held)
    m, s = c.manager, c.manager.astMachineStatus[1]
    m.xRunning = True
    m.eState = registry.enums["E_CELL_MANAGER_STATE"].SERVICE_TARGET
    m.uiSelectedMachine = m.uiSelectedType = 1
    m.uiBlankPayloadType, m.uiDetailPayloadType = held
    m.eMachineOperation = getattr(registry.enums["E_MACHINE_OPERATION"], operation)
    m.xMachineServiceStarted = True
    s.xError, s.xServiceRejected, s.xBusy = True, rejected, False
    if release_signal == "motion": m.xMotionBusy = True
    else: setattr(c.robot, "xBusy" if release_signal == "busy" else "xDone", True)
    m()
    assert m.eState == registry.enums["E_CELL_MANAGER_STATE"].RELEASE_ROBOT_COMMAND
    for _ in range(3):
        m()
        assert m.eState == registry.enums["E_CELL_MANAGER_STATE"].RELEASE_ROBOT_COMMAND
        assert not any(m.Command.axMachineExecute.values) and not m.Command.stRobot.xExecute
        assert not m.Error.dwErrorActive
    c.robot.xBusy = c.robot.xDone = m.xMotionBusy = False
    m()
    assert m.eState == registry.enums["E_CELL_MANAGER_STATE"].SELECT_FALLBACK
    m()
    assert not m.Error.dwErrorActive
    assert (c.robot.xBlankAvailable, c.robot.xDetailAvailable) == tuple(bool(n) for n in held)
    assert s.xError  # The primary owner has not been reset or hidden.
    if held[1] or not held[0]:
        assert m.eState == registry.enums["E_CELL_MANAGER_STATE"].PLAN_TARGET
    else:
        assert m.eState == registry.enums["E_CELL_MANAGER_STATE"].WAIT_MAGAZINE


def test_fallback_with_a_reported_blank_but_unknown_type_still_faults(registry):
    c = Cell(registry=registry, autostart=False)
    c.hold(blank=1)
    m = c.manager
    m.uiBlankPayloadType = c.robot.uiBlankPayloadType = 0
    m.xRunning = True
    m.eState = registry.enums["E_CELL_MANAGER_STATE"].SELECT_FALLBACK
    m()
    assert m.Error.dwErrorActive & m.ERR_MAGAZINE
