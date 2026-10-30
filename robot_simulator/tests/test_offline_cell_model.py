"""Offline cell decisions run from the working ST; these tests never use a PLC."""
from __future__ import annotations

import copy
from itertools import product

import pytest

from robot_simulator.plc_model.cell import Cell, Machine
from robot_simulator.plc_model.findings import REPRODUCTIONS
from robot_simulator.plc_model.st_runtime import (
    HELPERS, Clock, FallingEdge, Program, Record, RisingEdge, StArray, Tof, Ton,
)


def execute(source, state=None):
    state = state if state is not None else {}
    state.setdefault("_types", {})
    Program(source).execute(state)
    return state


def test_iec_eager_operators_detect_out_of_bounds_even_when_guard_is_false():
    state = {"items": StArray(1, [True], "BOOL"), "_types": {}}
    with pytest.raises(IndexError, match="index 0"):
        execute("result := FALSE AND items[0];", state)
    execute("result := FALSE AND_THEN items[0];", state)
    assert state["result"] is False
    with pytest.raises(IndexError, match="index 2"):
        execute("result := TRUE OR items[2];", state)


def test_scalar_width_signed_conversion_integer_division_and_bitwise_not():
    state = {"_types": {"ui": "UINT", "udi": "UDINT", "signed": "SINT"}}
    execute("ui := UINT#65535 + UINT#1; udi := UDINT#4294967295 + UDINT#1; signed := 255; "
            "mask := DWORD#16#FF AND NOT DWORD#16#0F; quotient := -7 / 2; flag := NOT FALSE;", state)
    execute("owner := SHL(DWORD#1, UINT#8); overflow := SHL(DWORD#16#80000000, UINT#1);", state)
    assert (state["owner"], state["overflow"]) == (256, 0)
    assert (state["ui"], state["udi"], state["signed"], state["mask"], state["quotient"], state["flag"]) == (0, 0, -1, 240, -3, True)
    assert HELPERS["SINT_TO_UINT"](-1) == 65535


def test_nested_case_loops_and_structure_assignments_preserve_value_semantics():
    record = Record({"n": "UINT"}, {"n": 1})
    state = {"original": record, "items": StArray(1, [0, 0], "UINT"), "_types": {}}
    execute("cloned := original; cloned.n := 7; "
            "FOR i := 1 TO 2 DO CASE i OF 1: CASE cloned.n OF 7: items[i] := 11; END_CASE; "
            "2: items[i] := 22; ELSE items[i] := 99; END_CASE; END_FOR;", state)
    assert record.n == 1 and state["cloned"].n == 7
    assert state["items"].values == [11, 22]
    duplicate = copy.deepcopy(state["items"]); duplicate[1] = 33
    assert state["items"][1] == 11
    with pytest.raises(AttributeError, match="Undeclared"):
        record.unknown = 1


def test_timers_and_edges_use_explicit_scan_clock_and_reset():
    clock = Clock(); timer = Ton(clock)
    timer(IN=True, PT=1000); assert not timer.Q
    clock.now = 999; timer(IN=True, PT=1000); assert not timer.Q and timer.ET == 999
    clock.now = 1000; timer(IN=True, PT=1000); assert timer.Q and timer.ET == 1000
    timer(IN=False, PT=1000); assert not timer.Q and timer.ET == 0
    timer(IN=True, PT=0); assert timer.Q
    falling = FallingEdge(); falling(CLK=True); falling(CLK=False); assert falling.Q
    rising = RisingEdge(); rising(CLK=True); assert rising.Q
    rising(CLK=True); assert not rising.Q
    off = Tof(clock); off(IN=True, PT=1000); assert off.Q
    off(IN=False, PT=1000); clock.now += 1000; off(IN=False, PT=1000); assert not off.Q


def test_unknown_st_is_not_silently_ignored():
    with pytest.raises(SyntaxError):
        Program("WHILE TRUE DO result := 1; END_WHILE;")
    with pytest.raises(NameError):
        Program("result := ADR(value);").execute({"_types": {}})


def test_real_enum_values_and_method_locals_do_not_corrupt_the_cell_loop():
    cell = Cell(autostart=False)
    assert cell.registry.enums["E_PART_STATE"].LOADED == 2
    assert cell.registry.enums["E_PART_TYPE"].DETAIL == 1
    cell.manager.uiMachine = 3
    assert cell.manager.IsMachineEligible(uiMachine=1)
    assert cell.manager.uiMachine == 3
    for bad in (0, 4, 65535):
        assert not cell.manager.IsMachineEligible(uiMachine=bad)


@pytest.mark.parametrize("mode,slots", [(0, 120), (1, 96)])
def test_last_physical_slot_is_selected_without_index_truncation(mode, slots):
    cell = Cell(mode=mode, slots=slots, magazines=[[-1] * (slots - 1) + [1], [-1] * slots],
                enabled=(True, False))
    cell.scan()
    assert cell.manager.iTakeSlot == slots
    assert cell.manager.eMagazineOperation == cell.registry.enums["E_MAGAZINE_OPERATION"].TAKE
    cell.run(6)
    assert not cell.manager.Error.dwErrorActive
    assert not cell.magazines[0].Status.xError


def test_auto_call_id_wrap_and_repeated_confirmed_take_do_not_duplicate_the_call():
    cell = Cell(geometry=(True, False), autostart=False)
    cell.persistent.xAutoEnabled = True
    cell.persistent.udiNextCallId = 0xffffffff
    cell.persistent.auiPeriod[1] = 1
    take = cell.manager.state["F_GEOMETRY_TAKE_DETAIL"]
    assert take(uiMachine=1, uiProductType=1)
    first = cell.geometry.astCalls[1]
    assert (first.udiId, first.uiState, cell.persistent.udiNextCallId) == (1, 2, 1)
    assert not take(uiMachine=1, uiProductType=1)
    assert cell.geometry.astCalls[1].udiId == 1 and cell.geometry.astCalls[1].uiState == 2
    assert cell.geometry.auiActiveCount[1] == 0


def test_pending_call_cancel_unblocks_only_its_machine_and_repeat_call_keeps_id():
    cell = Cell(machines=[Machine("done") for _ in range(3)], geometry=(True, False), autostart=False)
    for index in (1, 2):
        assert cell.call(index)
    call_id = cell.geometry.astCalls[1].udiId
    assert cell.call(1) and cell.geometry.astCalls[1].udiId == call_id
    cell.geometry.astStatus[1].xReady = False
    cell.manager.UpdateGeometryWait()
    assert cell.manager.axGeometryUnloadBlocked.values == [True, True, False]
    assert cell.call(1, cancel=True)
    cell.manager.UpdateGeometryWait()
    assert cell.manager.axGeometryUnloadBlocked.values == [False, True, False]


@pytest.mark.parametrize("mode,roles", [(0, (1, 1)), *[(1, roles) for roles in product((1, 2), repeat=2)]])
def test_complete_small_batches_keep_inventory_in_all_physical_pallet_roles(mode, roles):
    cell = Cell(mode=mode, roles=roles, slots=2, magazines=[[1, 0], [1, 0]],
                operator=[[1, 0], [1, 0]], geometry=(True, True))
    assert cell.call(1)
    cell.run(430)
    assert cell.inventory() == cell.initial_inventory
    assert not cell.manager.Error.dwErrorActive
    assert not cell.service_jobs and not cell.processing
    assert not cell.robot.xBlankAvailable and not cell.robot.xDetailAvailable
    assert all(status.ePartState != cell.registry.enums["E_PART_STATE"].LOADED for status in cell.manager.astMachineStatus.values)
    for index, magazine in enumerate(cell.magazines, 1):
        inventories = cell.twin.astStore[index].astPallet.values if mode else [magazine.stInventory]
        assert not any(slot.xInPosition and slot.eDetailType == cell.registry.enums["E_DETAIL_TYPE"].BLANK
                       for inventory in inventories for slot in inventory.aSlots.values[:cell.slots])
    assert sum(station.Memory.udiProducedPartsTotal for station in cell.stations) == 1
    if mode:
        assert len([item for item in cell.trace if item.get("event") == "swap"]) == 2


def test_waiting_calls_release_each_machine_independently_when_a_gk_becomes_free():
    cell = Cell(machines=[Machine("done") for _ in range(3)], magazines=[[0, 0], [0, 0]],
                slots=2, geometry=(True, True), autostart=False)
    for index in (1, 2):
        status = cell.geometry.astStatus[index]
        status.xReady = False; status.xOccupied = True; status.uiState = 4
    for index in (1, 2, 3):
        assert cell.call(index)
    cell.manager.xRunning = True
    cell.manager.UpdateGeometryWait()
    assert cell.manager.axGeometryUnloadBlocked.values == [True, True, True]
    cell.geometry.astStatus[2].xReady = True
    cell.manager.UpdateGeometryWait()
    assert cell.manager.axGeometryUnloadBlocked.values == [False, False, False]


def test_wait_warning_uses_real_time_and_only_one_warning_per_wait_episode():
    cell = Cell(machines=[Machine("done"), Machine("disabled"), Machine("disabled")], autostart=False)
    # Seed a previously accepted call; both stations subsequently become unavailable.
    call = cell.geometry.astCalls[1]; call.udiId = 17; call.uiMachine = 1; call.uiState = 1
    cell.manager.xRunning = True
    cell.persistent.tWaitWarningTimeout = 1000
    cell.manager.UpdateGeometryWait()
    cell.manager.UpdateGeometryWait()
    cell.clock.now = 999; cell.manager.UpdateGeometryWait()
    assert cell.geometry.stCellWarning.udiSequence == 0
    cell.clock.now = 1000; cell.manager.UpdateGeometryWait()
    assert cell.geometry.stCellWarning.uiCode == 52 and cell.geometry.stCellWarning.udiSequence == 1
    cell.clock.now = 2000; cell.manager.UpdateGeometryWait()
    assert cell.geometry.stCellWarning.udiSequence == 1
    cell.g["GVL_ALARM"].Command.xResetWarnings = True
    cell.manager.UpdateGeometryWait()
    cell.g["GVL_ALARM"].Command.xResetWarnings = False
    cell.manager.UpdateGeometryWait()
    cell.clock.now = 3000; cell.manager.UpdateGeometryWait()
    assert cell.geometry.stCellWarning.udiSequence == 2


@pytest.mark.parametrize("finding", list(REPRODUCTIONS))
def test_known_cell_defect_should_allow_progress_without_spurious_fault(finding):
    _, evidence = REPRODUCTIONS[finding]()
    assert not evidence["violation"], evidence
