"""Reachable simultaneous faults and repair/reset/Stop ordering boundaries."""
from itertools import permutations, product

import pytest

from robot_simulator.plc_model.cell import Machine
from robot_simulator.plc_model.recovery import RecoveryCell


def material_locations(c):
    # An alarm deliberately changes the owner's logical part state to UNKNOWN.
    # Compare physical model occupancy and both slot banks, not a count that
    # necessarily omits an UNKNOWN machine until its feedback is repaired.
    banks = []
    for index, magazine in enumerate(c.magazines, 1):
        inventories = c.twin.astStore[index].astPallet.values if c.mode else [magazine.stInventory]
        banks.extend(tuple((s.xInPosition, s.eDetailType, s.uiProductType)
                           for s in inventory.aSlots.values[:c.slots]) for inventory in inventories)
    return (tuple(banks), tuple(b.Status.xChuckClamped for b in c.machine_sim),
            tuple(s.Memory.xOccupied for s in c.stations), dict(c.removed))


def fault_pair(mode=0, station=1, other="group"):
    c = RecoveryCell(mode=mode, geometry=(station == 1, station == 2), start=False,
                     machines=[Machine("done"), Machine(), Machine()],
                     magazines=[[1, 0, 0, 0], [1, 0, 0, 0]])
    assert c.call(1)
    c.begin()
    for _ in range(650):
        c.scan()
        if c.geometry.astSignals[station].xRobotInteraction: break
    else: raise AssertionError(c.snapshot())
    c.station_sim[station - 1].xAlarm = True
    if other == "group": c.group_fault = True
    elif other == "machine":
        c.machine_sim[0].FaultRequest.xEnabled = True
        c.machine_sim[0].FaultRequest.xMachineAlarm = True
    else:
        c.robot_block.stPhysicalGripperFeedback = c.robot_block.fbGripper.Status
        c.robot_block.xUsePhysicalGripperFeedback = True
        c.robot_block.xPhysicalGripperIoReady = False
    for _ in range(15): c.scan()
    c.manual = True
    for _ in range(8): c.scan()
    assert c.stations[station - 1].Status.xError and c.robot.xError
    return c


def repair(c, station, other, equipment):
    if equipment == "gk": c.station_sim[station - 1].xAlarm = False
    elif other == "group": c.group_fault = False
    elif other == "machine": c.machine_sim[0].FaultRequest.xEnabled = False
    else: c.robot_block.xUsePhysicalGripperFeedback = False


def finish(c, station, other, stock, cargo, call_id, count):
    repair(c, station, other, "gk")
    repair(c, station, other, "other")
    c.stop = False
    for _ in range(10): c.scan()
    c.pulse_reset()
    for _ in range(15): c.scan()
    assert not any(c.errors().values()), c.errors()
    assert material_locations(c) == stock
    assert (c.robot.xBlankAvailable, c.robot.xDetailAvailable) == cargo
    assert c.geometry.astCalls[1].udiId == call_id
    assert c.stations[station - 1].Memory.udiProducedPartsTotal == count
    restored = c.ready_for_start(max_resets=0)
    assert restored["ready"] and restored["resets"] == 0 and c.restart(), restored


@pytest.mark.parametrize("mode,station,other,first", list(product(
    (0, 1), (1, 2), ("group", "gripper", "machine"), ("gk", "other"))))
def test_two_live_causes_have_a_bounded_exit_in_both_repair_orders(mode, station, other, first):
    c = fault_pair(mode, station, other)
    stock, cargo = material_locations(c), (c.robot.xBlankAvailable, c.robot.xDetailAvailable)
    call_id, count = c.geometry.astCalls[1].udiId, c.stations[station - 1].Memory.udiProducedPartsTotal
    repair(c, station, other, first)
    c.pulse_reset()
    for _ in range(40): c.scan()
    assert not c.robot_block.ResetRecovery.xActive and not c.manager.Status.xRunning
    assert any(c.errors().values())  # The second primary cause is still held.
    repair(c, station, other, "other" if first == "gk" else "gk")
    for _ in range(10): c.scan()
    assert any(c.errors().values())  # No silent retry on repair.
    finish(c, station, other, stock, cargo, call_id, count)


@pytest.mark.parametrize("order", list(permutations(("repair_gk", "repair_group", "reset", "stop"))))
def test_all_pair_repair_reset_stop_orderings_leave_an_explicit_recovery_path(order):
    c = fault_pair()
    stock, cargo = material_locations(c), (c.robot.xBlankAvailable, c.robot.xDetailAvailable)
    call_id, count = c.geometry.astCalls[1].udiId, c.stations[0].Memory.udiProducedPartsTotal
    for action in order:
        if action == "repair_gk": repair(c, 1, "group", "gk")
        elif action == "repair_group": repair(c, 1, "group", "other")
        elif action == "stop": c.stop = True
        else: c.pulse_reset()
        for _ in range(3): c.scan()
    finish(c, 1, "group", stock, cargo, call_id, count)
