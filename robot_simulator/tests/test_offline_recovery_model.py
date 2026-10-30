"""Fault/recovery decisions execute working ST; no controller or network I/O.

Seeded-mask checks prove exits from ERROR, not reachability of every cause.
Separate live-injection cases preserve production scan order and handshakes.
"""
from __future__ import annotations

from itertools import combinations, permutations, product

import pytest

from robot_simulator.plc_model.cell import Machine
from robot_simulator.plc_model.recovery import RecoveryCell, TwinPlant, recovery_registry
from robot_simulator.plc_model.recovery_audit import physical_alarm_loss, reproduce
from robot_simulator.plc_model.st_runtime import Block, Clock, Program, Tp, declarations


@pytest.fixture(scope="module")
def idle():
    return RecoveryCell(start=False)


def step(block, count=1, dt=100):
    for _ in range(count):
        block.registry.clock.now += dt
        block()


def constants(relative, prefix="ERR_"):
    registry = recovery_registry()
    source = (registry.root / relative).read_text(encoding="utf-8-sig")
    return [d.name for d in declarations(source) if d.name.startswith(prefix)]


def test_tp_and_fb_output_mapping_match_scan_semantics():
    clock = Clock(); timer = Tp(clock)
    timer(IN=True, PT=1000); assert timer.Q
    clock.now = 400; timer(IN=False, PT=1000); assert timer.Q and timer.ET == 400
    clock.now = 999; timer(IN=True, PT=1000); assert timer.Q  # No retrigger in pulse.
    clock.now = 1000; timer(IN=True, PT=1000); assert not timer.Q
    clock.now = 1100; timer(IN=False, PT=1000)
    clock.now = 1200; timer(IN=True, PT=1000); assert timer.Q and timer.ET == 0
    state = {"timer": timer, "_types": {"ready": "BOOL", "elapsed": "TIME"}}
    Program("timer(IN := FALSE, PT := T#1S, Q => ready, ET => elapsed);").execute(state)
    assert state["ready"] and state["elapsed"] == 0


@pytest.mark.parametrize("name", constants("FB/FB_MACHINE.st"))
def test_each_machine_error_mask_has_an_exit_after_repair(idle, name):
    b = Block(idle.registry, "FB/FB_MACHINE.st", idle.manager.state)
    b.xPointsConfigured = b.xAutomaticUseEnabled = True
    b.stMachineStatus, b.stRobotStatus = idle.machine_sim[0].Status, idle.robot
    b.stTimeouts = idle.settings.stMachineTimeouts
    b(xTestInitialize=True, uiTestInitialState=1); b.xTestInitialize = False
    bit = b.state[name]; assert bit and bit & (bit - 1) == 0
    b.Error.dwErrorActive, b.eState = bit, idle.registry.enums["E_MACHINE_STATE"].ERROR
    b.xResetGlobal = True; step(b)
    assert b.Error.dwErrorActive == 0, (name, b.Diag.__dict__)
    assert b.eState == idle.registry.enums["E_MACHINE_STATE"].DISABLED
    assert not b.Command.stRobot.xExecute and not b.Status.xEnabled


@pytest.mark.parametrize("name", constants("FB/FB_MAGAZINE.st"))
def test_each_magazine_error_mask_has_an_exit_after_repair(idle, name):
    b = Block(idle.registry, "FB/FB_MAGAZINE.st", idle.manager.state)
    b.uiMagazineId, b.uiRows, b.uiColumns, b.uiTypeCount = 1, 4, 1, 1
    b.lrPitchX = b.lrPitchY = 60
    b.xPointsConfigured = b.xMechanismReady = b.xRobotCanWorkWithMagazine = True
    b.stRobotStatus = idle.robot
    b(xTestInitialize=True, xTestEnabled=True); b.xTestInitialize = False
    bit = b.state[name]; assert bit and bit & (bit - 1) == 0
    b.Error.dwErrorActive, b.Diag.eState = bit, idle.registry.enums["E_MAGAZINE_STATE"].ERROR
    b.xReset = True; step(b)
    assert b.Error.dwErrorActive == 0, name
    assert not b.Status.xEnabled and not b.Command.xExecute


@pytest.mark.parametrize("name", constants("FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st"))
def test_each_cell_error_mask_has_an_exit_without_restart(idle, name):
    b = Block(idle.registry, "FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st", idle.g)
    # Method globals are the same real records as the idle integration fixture.
    b.state.update(idle.g)
    for function in ("F_GEOMETRY_EVENT", "F_GEOMETRY_SELECT_STATION", "F_GEOMETRY_TAKE_DETAIL"):
        b.state[function] = b._method(idle.registry.program("FB/" + function + ".st"))
    b.Config = idle.manager.Config
    b.astMachineStatus, b.astMagazineStatus, b.stRobotStatus = idle.manager.astMachineStatus, idle.manager.astMagazineStatus, idle.robot
    bit = b.state[name]; assert bit and bit & (bit - 1) == 0
    b.Error.dwErrorActive, b.eState = bit, idle.registry.enums["E_CELL_MANAGER_STATE"].ERROR
    b.xReset = True; step(b)
    assert b.Error.dwErrorActive == 0 and not b.Status.xRunning, name
    assert not b.Command.stRobot.xExecute


@pytest.mark.parametrize("owner,bit", [*(('robot', bit) for bit in (1, 2, 4, 16)),
    *(('motion', 1 << n) for n in range(4)), *(('gripper', 1 << n) for n in range(5))])
def test_softmotion_child_and_parent_error_masks_have_an_exit(idle, owner, bit):
    b = Block(idle.registry, "FB/FB_ROBOT.st", {**idle.manager.state, **idle.g})
    b.xManual = b.xHmiPermit = b.xDrivesReady = b.xDrivesPowered = True
    b.GroupData.Diag.iStep = idle.registry.enums["E_AXIS_GROUP_STATE"].READY
    b(); b()
    b.Error.dwErrorActive = bit if owner == "robot" else 2 if owner == "motion" else 4
    b.eState = idle.registry.enums["E_ROBOT_STATE"].ERROR
    if owner == "motion":
        b.stMotionManager.Error.dwErrorActive = bit
        b.stMotionManager.Diag.eState = idle.registry.enums["E_MOTION_MANAGER_STATE"].ERROR
    elif owner == "gripper":
        b.fbGripper.Error.dwErrorActive = bit
        b.fbGripper.eState = idle.registry.enums["E_GRIPPER_STATE"].ERROR
    step(b, 2)  # Publish child ResetAllowed before the edge.
    b.xReset = True; step(b); b.xReset = False; step(b, 6)
    assert b.Error.dwErrorActive == b.stMotionManager.Error.dwErrorActive == b.fbGripper.Error.dwErrorActive == 0
    assert not b.Status.xBusy and not b.Command.xExecute


SAFETY_SOURCES = [("axEmergencyStopButtonStationInput", i, True, False) for i in range(1, 5)] + [
    ("axEmergencyStopCabinetInput", i, True, False) for i in (1, 2)] + [
    ("xEmergencyStopMpgInput", None, True, False), ("xPhaseRelayOkInput", None, False, True),
    ("xPressureRelayOkInput", None, False, True), ("xSafetyRelayOkInput", None, False, True),
    *[("axDoorLockClosedInput", i, False, True) for i in range(1, 5)]]
SAFETY_COMBINATIONS = [(i,) for i in range(14)] + list(combinations(range(14), 2)) + [tuple(range(14))]


@pytest.mark.parametrize("faults", SAFETY_COMBINATIONS)
def test_live_safety_causes_and_pairs_cannot_be_reset_until_repaired(idle, faults):
    b = Block(idle.registry, "FB/FB_CELL_SAFETY.st", idle.g)
    b.xPhaseRelayOkInput = b.xPressureRelayOkInput = b.xSafetyRelayOkInput = True
    for i in range(1, 5): b.axDoorLockClosedInput[i] = True
    for i in (1, 2): b.astMagazineStatus[i].xEnabled = True
    step(b); assert b.Status.xReady
    def apply(index, repaired):
        name, at, bad, good = SAFETY_SOURCES[index]
        if at is None: setattr(b, name, good if repaired else bad)
        else: getattr(b, name)[at] = good if repaired else bad
    for index in faults: apply(index, False)
    step(b); expected = sum(1 << i for i in faults)
    assert b.Error.dwErrorActive == expected and not b.Status.xReady
    b.xCellResetButtonInput = b.xSafetyRelayReset = True; step(b)
    assert b.Error.dwErrorActive == expected
    for position, index in enumerate(reversed(faults)):
        apply(index, True); step(b)
        assert bool(b.Error.dwErrorActive) == (position + 1 < len(faults))
    assert b.Status.xReady and not b.xCellEnablePulse


@pytest.mark.parametrize("role,bit", list(product((1, 2), range(8, 14))))
def test_twin_error_masks_restore_through_permitted_commands(idle, role, bit):
    p = TwinPlant(idle.registry, idle.g, role); b = p.block
    b.Error.dwErrorActive = 1 << bit
    if bit in (8, 11, 13): b.Status.xHomeRequired = True
    step(b)
    assert not b.Status.xEnabled
    outcome = p.restore()
    assert outcome["ready"] and not outcome["error"] and not outcome["home_required"], outcome
    assert all(accepted for _, accepted in outcome["actions"])


@pytest.mark.parametrize("role,phase,cause", list(product((1, 2),
    ("AUTO_MOVE_TO_EXCHANGE", "AUTO_SELECT_PALLET", "AUTO_MOVE_TO_WORK", "AUTO_RAISE"),
    ("safety", "drive", "timeout"))))
def test_interrupted_twin_swap_has_a_manual_exit(idle, role, phase, cause):
    p = TwinPlant(idle.registry, idle.g, role); b = p.block
    assert p.command("xDisable")
    b.Command.xSwap = True; p.registry.clock.now += 100; p.step(); b.Command.xSwap = False
    for _ in range(50):
        if b.Diag.eState == getattr(p.registry.enums["E_TWO_PALLET_STATE"], phase): break
        p.registry.clock.now += 100; p.step()
    else: raise AssertionError(phase)
    if cause == "safety": b.xSafe = False
    elif cause == "drive": p.drive_fault = True
    elif "MOVE" in phase: p.freeze_axis = True
    else:
        p.freeze_cylinders = True
        if phase == "AUTO_RAISE":
            p.sensor_overrides.update(xLiftDown=False, xLiftUp=False)
    for _ in range(40): p.registry.clock.now += 100; p.step()
    assert b.Error.dwErrorActive and not b.Status.xEnabled
    p.freeze_axis = p.freeze_cylinders = p.drive_fault = False; b.xSafe = True
    p.sensor_overrides.clear()
    p.registry.clock.now += 100; p.step()
    outcome = p.restore()
    assert outcome["ready"] and not outcome["error"] and not outcome["home_required"], (phase, cause, outcome)
    assert b.Status.uiRobotPallet in (1, 2) and b.Status.xConfirmed


MACHINE_TIMEOUTS = [("xTimeoutRobotMove", 0x8000), ("xTimeoutRobotAction", 0x10000),
    ("xTimeoutRobotRelease", 0x20000), ("xTimeoutDoorOpen", 0x40000),
    ("xTimeoutDoorClose", 0x80000), ("xTimeoutChuckOpen", 0x100000),
    ("xTimeoutChuckClose", 0x200000), ("xTimeoutCycleStart", 0x400000),
    ("xTimeoutHatchUnlock", 0x1000000)]


@pytest.mark.parametrize("field,mask", MACHINE_TIMEOUTS)
def test_machine_live_timeout_can_be_repaired_reset_and_restarted(field, mask):
    c = RecoveryCell(machines=[Machine("done" if field == "xTimeoutChuckOpen" else "empty"), Machine(), Machine()])
    request = c.machine_sim[0].FaultRequest
    request.xEnabled = True
    if field != "xTimeoutRobotRelease": setattr(request, field, True)
    for _ in range(650):
        if field == "xTimeoutRobotRelease" and c.enum_name("E_MACHINE_STATE", c.machine_blocks[0].eState) == "RELEASE_ROBOT_ACTION":
            request.xTimeoutRobotRelease = True
        c.scan()
        if c.machine_blocks[0].Error.dwErrorActive: break
    assert c.machine_blocks[0].Error.dwErrorActive & mask, (field, c.errors(), c.snapshot())
    request.xEnabled = False
    outcome = c.ready_for_start()
    assert outcome["ready"] and c.restart(), (field, outcome, c.snapshot())


@pytest.mark.parametrize("mode,when,cause", list(product((0, 1), (25, 50, 130, 150), ("group", "global", "machine"))))
def test_live_faults_allow_home_and_a_new_start_with_one_product(mode, when, cause):
    c = RecoveryCell(mode=mode)
    while c.scans < when: c.scan()
    if cause == "group": c.group_fault = True
    elif cause == "global": c.global_fault = True
    else:
        c.machine_sim[0].FaultRequest.xEnabled = True
        c.machine_sim[0].FaultRequest.xMachineAlarm = True
    for _ in range(12): c.scan()
    assert any(c.errors().values())
    c.group_fault = c.global_fault = False
    c.machine_sim[0].FaultRequest.xEnabled = False
    before_reset = c.snapshot()
    for _ in range(3): c.scan()
    assert not c.manager.Status.xStartAllowed
    outcome = c.ready_for_start()
    assert outcome["ready"], (before_reset, outcome)
    assert not any(c.errors().values()) and not c.manager.Status.xRunning
    assert c.robot.eCurrentPoint == c.registry.enums["E_POINT_NAME"].HOME_SAFETY
    assert (c.robot.xBlankAvailable, c.robot.xDetailAvailable) == c.recovery_cargo
    assert [[(s.xInPosition, s.eDetailType, s.uiProductType) for s in b.stInventory.aSlots.values]
            for b in c.magazines] == c.recovery_stock
    cargo = c.robot.xBlankAvailable, c.robot.xDetailAvailable
    assert c.restart(), (cause, when, c.snapshot(), cargo)


@pytest.mark.parametrize("field,action,mask", [
    ("xGripper1Fault", "CLAMP_1", 1), ("xGripper2Fault", "CLAMP_2", 2),
    ("xRotationFault", "ROTATE_TO_DETAIL", 4), ("xGlobalFault", "CLAMP_1", 16)])
def test_live_gripper_failure_during_its_action_has_a_recovery_path(field, action, mask):
    c = RecoveryCell(machines=[Machine("done"), Machine(), Machine()])
    for _ in range(600):
        if c.robot_block.eActiveAction == getattr(c.registry.enums["E_ROBOT_ACTION"], action) and c.robot.xBusy: break
        c.scan()
    else: raise AssertionError((field, c.snapshot()))
    request = c.robot_block.FaultRequest.stGripper
    request.xEnabled = True; setattr(request, field, True)
    for _ in range(12): c.scan()
    assert c.robot_block.fbGripper.Error.dwErrorActive & mask
    request.xEnabled = False
    outcome = c.ready_for_start()
    assert outcome["ready"] and c.restart(), outcome


@pytest.mark.parametrize("cause,mask", [("X", 1), ("Y", 2), ("Z", 4), ("velocity", 8),
    ("X_limit", 16), ("Y_limit", 32), ("Z_limit", 64), ("configured", 128)])
def test_live_point_validation_fault_can_be_repaired_and_restarted(cause, mask):
    c = RecoveryCell(start=False); c.manual = True
    b = c.robot_block; home = c.registry.enums["E_POINT_NAME"].HOME_SAFETY
    point, diag = b.stPoint[home], b.stPointManager.Diag
    original = point.X, point.Y, point.Z, point.SpeedFactor, point.xConfigured
    if cause in ("X", "Y", "Z"): setattr(point, cause, 20000)
    elif cause == "velocity": point.SpeedFactor = 0
    elif cause == "configured": point.xConfigured = False
    else: setattr(diag, "x" + cause[0] + "LimitValid", False)
    b.stHmiCommand.eAction = c.registry.enums["E_ROBOT_ACTION"].MOVE_TO_POINT
    b.stHmiCommand.eSetPoint, b.stHmiCommand.xExecute = home, True
    for _ in range(50):
        c.scan()
        if b.Status.xError: break
    assert b.stPointManager.Error.dwErrorLast & mask, (cause, c.snapshot())
    b.stHmiCommand.xExecute = False
    point.X, point.Y, point.Z, point.SpeedFactor, point.xConfigured = original
    for axis in ("X", "Y", "Z"): setattr(diag, "x" + axis + "LimitValid", True)
    outcome = c.ready_for_start()
    assert outcome["ready"] and c.restart(), outcome


@pytest.mark.parametrize("order", list(permutations(("repair", "reset", "stop"))))
def test_fault_stop_reset_orderings_leave_a_manual_recovery_path(order):
    c = RecoveryCell()
    while c.scans < 50: c.scan()
    c.group_fault = True
    for _ in range(12): c.scan()
    c.manual = True
    for _ in range(5): c.scan()
    for action in order:
        if action == "repair": c.group_fault = False
        elif action == "reset": c.reset = True
        else: c.stop = True
        c.scan(); c.reset = c.stop = False; c.scan()
    assert c.ready_for_start()["ready"], (order, c.snapshot())
    assert not c.manager.Status.xRunning and c.restart()


@pytest.mark.parametrize("roles,cause", list(product(list(product((1, 2), repeat=2)), ("group", "global", "twin"))))
def test_fault_recovery_preserves_every_physical_pallet_role(roles, cause):
    c = RecoveryCell(mode=1, roles=roles)
    while c.scans < 50: c.scan()
    if cause == "group": c.group_fault = True
    elif cause == "global": c.global_fault = True
    else: c.twins[0].drive_fault = True
    for _ in range(12): c.scan()
    assert any(c.errors().values())
    c.group_fault = c.global_fault = c.twins[0].drive_fault = False
    outcome = c.ready_for_start()
    assert outcome["ready"] and c.restart(), (roles, cause, outcome)
    assert tuple(p.block.Status.uiRobotPallet for p in c.twins) == roles


@pytest.mark.parametrize("held", ("group", "global", "gripper", "execute", "stop"))
def test_reset_with_an_active_cause_or_command_never_restarts_the_cell(held):
    c = RecoveryCell()
    while c.scans < 50: c.scan()
    c.group_fault = held != "gripper"
    if held == "gripper":
        c.robot_block.FaultRequest.stGripper.xEnabled = True
        c.robot_block.FaultRequest.stGripper.xGlobalFault = True
    for _ in range(12): c.scan()
    c.manual = True
    for _ in range(8): c.scan()
    if held != "group": c.group_fault = False
    if held == "global": c.global_fault = True
    elif held == "execute": c.robot_block.stHmiCommand.xExecute = True
    elif held == "stop": c.robot_block.stHmiCommand.xStop = True
    c.pulse_reset()
    if held != "global": assert c.robot.xError
    # Manual recovery can reset robot/Motion under GlobalError for Jog;
    # the safety fault and automatic Start must remain blocked.
    assert not c.manager.Status.xRunning and not c.manager.Status.xStartAllowed
    if held == "global": assert c.manager.Error.dwErrorActive
    c.group_fault = c.global_fault = False
    c.robot_block.FaultRequest.stGripper.xEnabled = False
    c.robot_block.stHmiCommand.xExecute = c.robot_block.stHmiCommand.xStop = False
    assert c.ready_for_start()["ready"] and c.restart(), c.snapshot()


def magazine_reset_race(mode=0, delay=2):
    c = RecoveryCell(mode=mode)
    c.group_reset_delay = delay
    while c.scans < 50: c.scan()
    c.group_fault = True
    for _ in range(12): c.scan()
    c.group_fault = False; c.manual = True
    for _ in range(8): c.scan()
    c.pulse_reset()
    return c


@pytest.mark.parametrize("mode,delay", list(product((0, 1), (2, 4, 8))))
def test_magazine_reset_race_is_not_a_permanent_deadlock(mode, delay):
    c = magazine_reset_race(mode, delay)
    assert not any(c.errors().values())
    assert c.ready_for_start()["ready"] and c.restart()


def test_one_accepted_reset_should_complete_the_magazine_cascade():
    c = magazine_reset_race()
    assert not any(c.errors().values()), c.errors()


def geometry_cell(phase):
    c = RecoveryCell(start=False, machines=[Machine("done"), Machine(), Machine()],
                     magazines=[[1, 0, 0, 0], [1, 0, 0, 0]])
    assert c.call(1); c.begin()
    for _ in range(600):
        c.scan(); s, b = c.geometry.astSignals[1], c.stations[0]
        if {"reserve": b.Status.xReserved, "interaction": s.xRobotInteraction,
            "deposited": b.Memory.xOccupied, "released": b.xTransport}[phase]:
            return c
    raise AssertionError((phase, c.snapshot()))


@pytest.mark.parametrize("phase", ("reserve", "interaction", "deposited", "released"))
def test_geometry_fault_releases_reservation_preserves_deposit_and_allows_restart(phase):
    c = geometry_cell(phase); station = c.stations[0]
    count, occupied = station.Memory.udiProducedPartsTotal, station.Memory.xOccupied
    c.station_sim[0].xAlarm = True
    for _ in range(15): c.scan()
    assert station.Status.xError
    c.station_sim[0].xAlarm = False
    outcome = c.ready_for_start()
    assert not any(c.errors().values()) and not station.Status.xReserved, outcome
    assert station.Memory.udiProducedPartsTotal == count and station.Memory.xOccupied == occupied
    assert station.Status.xRecoveryRequired and station.Status.xConfirmAllowed
    # Operator verifies/removes the part before confirming an empty belt.
    if occupied:
        station.uiAction = 7; c.scan()
    station.uiAction = 3; c.scan()
    station.uiAction = 1; c.scan()
    assert station.Status.xReady and not station.Status.xOccupied
    assert c.manager.Status.xStartAllowed and c.restart(), c.snapshot()


def test_one_accepted_reset_should_wait_for_geometry_reset_pulse():
    c = geometry_cell("interaction")
    c.station_sim[0].xAlarm = True
    for _ in range(15): c.scan()
    c.station_sim[0].xAlarm = False; c.manual = True
    for _ in range(8): c.scan()
    c.pulse_reset()
    assert not any(c.errors().values()), c.errors()


@pytest.mark.parametrize("finding", ("F004", "F005"))
def test_recovered_cycle_continues_420_scans_after_a_new_start(finding):
    cell, evidence = reproduce(finding)
    assert evidence["recovery_ready"] and evidence["new_start_accepted"]
    assert evidence["post_restart_scans_without_error"] == 420 and not any(cell.errors().values())
    assert not evidence["additional_reset_sent"]


@pytest.mark.parametrize("index", (1, 2, 3))
def test_real_machine_alarm_should_survive_disabled_injection_and_block_reset(index):
    _, evidence = physical_alarm_loss(index)
    assert not evidence["violation"], evidence
