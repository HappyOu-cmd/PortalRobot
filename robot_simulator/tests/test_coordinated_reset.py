"""One accepted reset, bounded failure and explicit retry across real ST owners."""
from itertools import product

import pytest

from robot_simulator.plc_model.cell import Cell, Machine, record
from robot_simulator.plc_model.recovery import RecoveryCell
from robot_simulator.plc_model.st_runtime import Registry, StArray


def magazine_fault(*, delay=12, mode=0):
    c = RecoveryCell(mode=mode)
    c.group_reset_delay = delay
    while c.scans < 50: c.scan()
    c.group_fault = True
    for _ in range(12): c.scan()
    c.group_fault = False
    c.manual = True
    for _ in range(8): c.scan()
    assert c.robot.xResetAllowed and c.magazines[0].Status.xError
    return c


def geometry_fault(*, held=False):
    c = RecoveryCell(start=False, machines=[Machine("done"), Machine(), Machine()],
                     magazines=[[1, 0, 0, 0], [1, 0, 0, 0]])
    assert c.call(1)
    c.begin()
    for _ in range(600):
        c.scan()
        if c.geometry.astSignals[1].xRobotInteraction: break
    else: raise AssertionError(c.snapshot())
    c.station_sim[0].xAlarm = True
    for _ in range(15): c.scan()
    c.station_sim[0].xAlarm = held
    c.manual = True
    for _ in range(8): c.scan()
    return c


def accept_once(c):
    before = c.robot_block.ResetRecovery.udiAttempt
    c.reset = True
    c.scan()
    c.reset = False
    assert c.robot_block.xResetAccepted
    assert c.robot_block.ResetRecovery.xActive
    assert c.robot_block.ResetRecovery.udiAttempt != before
    return c.robot_block.ResetRecovery.udiAttempt


@pytest.mark.parametrize("mode,cancel", list(product((0, 1), ("cell_stop", "robot_stop", "hmi", "global", "gripper"))))
def test_an_interrupted_reset_never_replays_and_a_new_explicit_reset_recovers(mode, cancel):
    c = magazine_fault(mode=mode)
    attempt = accept_once(c)
    inventory, payload = c.inventory(), (c.robot.xBlankAvailable, c.robot.xDetailAvailable)
    for _ in range(2): c.scan()
    if cancel == "cell_stop": c.stop = True
    elif cancel == "robot_stop": c.robot_block.stHmiCommand.xStop = True
    elif cancel == "hmi": c.manual = False
    elif cancel == "global": c.global_fault = True; c.manual = False
    else:
        c.robot_block.stPhysicalGripperFeedback = c.robot_block.fbGripper.Status
        c.robot_block.xUsePhysicalGripperFeedback = True
        c.robot_block.xPhysicalGripperIoReady = False
    for _ in range(20): c.scan()
    assert not c.robot_block.ResetRecovery.xActive
    assert c.robot_block.ResetRecovery.udiAttempt == attempt and c.robot.xError
    assert not c.manager.Status.xRunning
    assert c.inventory() == inventory
    assert (c.robot.xBlankAvailable, c.robot.xDetailAvailable) == payload
    c.stop = c.global_fault = False
    c.manual = True
    c.robot_block.stHmiCommand.xStop = False
    c.robot_block.xUsePhysicalGripperFeedback = False
    for _ in range(20): c.scan()
    assert c.robot.xError and not c.robot_block.ResetRecovery.xActive
    # A new Safety loss is also a new primary fault of the pallet mechanisms.
    # Repair those through their own manual commands before retrying the cell.
    for twin in c.twins:
        if twin.block.Error.dwErrorActive:
            twin.restore(enable=False)
    c.scan()
    c.pulse_reset()
    for _ in range(20): c.scan()
    assert not any(c.errors().values()), c.errors()
    assert c.ready_for_start()["ready"] and c.restart()


@pytest.mark.parametrize("repeats", (1, 2, 4))
def test_new_reset_edges_during_an_attempt_do_not_restart_it(repeats):
    c = magazine_fault(delay=12)
    attempt = accept_once(c)
    for _ in range(repeats):
        c.scan()
        c.reset = True; c.scan(); c.reset = False
        assert c.robot_block.ResetRecovery.udiAttempt == attempt
    for _ in range(25): c.scan()
    assert not any(c.errors().values()) and not c.robot_block.ResetRecovery.xActive
    assert c.robot_block.ResetRecovery.udiAttempt == attempt


def test_a_local_magazine_reset_does_not_request_a_robot_or_motion_reset():
    c = magazine_fault()
    owner = c.magazines[0]
    attempt = c.robot_block.ResetRecovery.udiAttempt
    owner(xReset=True)
    owner(xReset=False)
    assert owner.Status.xError and c.robot.xError
    assert not owner.xRobotResetCoordinated
    assert not c.robot_block.ResetRecovery.xActive
    assert c.robot_block.ResetRecovery.udiAttempt == attempt
    c.pulse_reset()
    for _ in range(20): c.scan()
    assert not any(c.errors().values())


@pytest.mark.parametrize("bit", range(8))
def test_an_independent_magazine_error_can_reset_while_an_unrelated_robot_error_remains(bit):
    c = Cell(autostart=False)
    owner = c.magazines[0]
    owner.Diag.eState = c.registry.enums["E_MAGAZINE_STATE"].ERROR
    owner.Error.dwErrorActive = 1 << bit
    owner.xFaultContextCaptured = True
    owner.xRobotInMagazineAtFault = False
    c.robot.xError = True
    c.robot.xResetAllowed = False
    owner.stRobotStatus = c.robot
    owner(xReset=True)
    assert bool(owner.Error.dwErrorActive) == (bit == 5)
    assert not owner.xRobotResetCoordinated
    assert c.robot.xError and not c.robot.xResetAllowed


@pytest.mark.parametrize("failure", ("new_alarm", "terminal_failure", "deadline"))
def test_gk_reset_failure_is_terminal_and_preserves_call_and_material(failure):
    c = geometry_fault(held=failure == "terminal_failure")
    station = c.stations[0]
    if failure == "deadline":
        station.tResetPulse = 5000
        c.robot_block.tSoftMotionResetTimeout = 500
    call_id = c.geometry.astCalls[1].udiId
    stock = c.inventory()
    count, occupied = station.Memory.udiProducedPartsTotal, station.Memory.xOccupied
    attempt = accept_once(c)
    c.scan()
    if failure == "new_alarm": c.station_sim[0].xAlarm = True
    for _ in range(20): c.scan()
    assert not c.robot_block.ResetRecovery.xActive and c.robot.xError
    assert c.robot_block.Diag.stWarning.uiCode == c.robot_block.WRN_RESET_EQUIPMENT_ERROR
    assert c.robot_block.ResetRecovery.udiAttempt == attempt
    assert c.geometry.astCalls[1].udiId == call_id
    assert c.inventory() == stock
    assert (station.Memory.udiProducedPartsTotal, station.Memory.xOccupied) == (count, occupied)
    c.station_sim[0].xAlarm = False
    for _ in range(60): c.scan()
    assert c.robot.xError and not c.robot_block.ResetRecovery.xActive
    c.robot_block.tSoftMotionResetTimeout = 30000
    station.tResetPulse = 1000
    c.pulse_reset()
    assert not any(c.errors().values()), c.errors()


@pytest.mark.parametrize("initial", (0, 0xFFFFFFFF))
def test_reset_attempt_identity_wraps_without_accepting_a_stale_magazine_confirmation(initial):
    c = magazine_fault(delay=4)
    c.robot_block.ResetRecovery.udiAttempt = initial
    attempt = accept_once(c)
    assert attempt == 1
    assert c.magazines[0].udiRobotResetAttempt == attempt
    for _ in range(20): c.scan()
    assert not any(c.errors().values())


def test_reset_dependency_adapter_keeps_all_nine_owners_separate():
    r = Registry()
    program = r.program("PLC_PRG.BuildRobotResetDependencies.st")
    machines = StArray(1, [r.value("ST_MACHINE_PUBLIC", {}) for _ in range(3)], "ST_MACHINE_PUBLIC")
    magazines = StArray(1, [r.value("ST_MAGAZINE_STATUS", {}) for _ in range(2)], "ST_MAGAZINE_STATUS")
    geometry = StArray(1, [r.value("ST_GEOMETRY_STATUS", {}) for _ in range(2)], "ST_GEOMETRY_STATUS")
    twins = StArray(1, [record(Input=r.value("ST_TWO_PALLET_INPUT", {})) for _ in range(2)], "FB_TWO_PALLET")
    feedback = StArray(1, [record(xDriveAlarm=True) for _ in range(2)], "FB_GEOMETRY_CONTROL")
    context = StArray(1, [False, False], "BOOL")
    output = r.value("ST_ROBOT_RESET_DEPENDENCIES", {})
    env = {**r.enums, "_types": {}, "GVL_MACHINE": record(Status=machines),
        "GVL_MAGAZINE": record(astPartStatus=magazines),
        "GVL_GEOMETRY_CONTROL": record(xSupported=True, astStatus=geometry),
        "GVL_TWO_PALLET": record(uiMode=1), "GEOMETRY": feedback, "TWIN": twins,
        "axTwinRobotStopLatched": context, "stRobotResetDependencies": output}
    for mask in range(512):
        for i in (1, 2, 3):
            machines[i].xCriticalError = bool(mask & (1 << (i - 1)))
            machines[i].stIo.xAlarm = True
        for i in (1, 2):
            magazines[i].xRobotStopRequired = bool(mask & (1 << (i + 2)))
            geometry[i].xRobotStopRequired = bool(mask & (1 << (i + 4)))
            geometry[i].xResetBusy = True
            context[i] = bool(mask & (1 << (i + 6)))
            twins[i].Input.xDriveError = True
        program.execute(env)
        assert output.dwStopOwners == mask
        assert output.dwLiveCauses == (mask & ~24)
        assert output.dwResetBusy == 96
    env["GVL_GEOMETRY_CONTROL"].xSupported = False
    env["GVL_TWO_PALLET"].uiMode = 0
    program.execute(env)
    assert output.dwStopOwners == 31 and output.dwLiveCauses == 7 and not output.dwResetBusy


@pytest.mark.parametrize("mode,index,phase", list(product((0, 1), (1, 2, 3), ("ROBOT_MOVE", "ROBOT_ACTION"))))
def test_common_reset_also_releases_a_machine_cascade_with_robot_inside(mode, index, phase):
    c = RecoveryCell(mode=mode, machines=[Machine("empty" if n == index else "disabled") for n in (1, 2, 3)])
    owner = c.machine_blocks[index - 1]
    for _ in range(600):
        c.scan()
        if c.enum_name("E_MACHINE_STATE", owner.eState) == phase and owner.xRobotInsideMachine:
            break
    else: raise AssertionError((index, phase, c.snapshot()))
    c.group_fault = True
    for _ in range(12): c.scan()
    assert owner.Status.xError and owner.Status.xCriticalError
    c.group_fault = False
    c.manual = True
    for _ in range(8): c.scan()
    owner.xHmiOpenHatch = owner.xManualHatchRecoveryOpenAllowed
    for _ in range(5): c.scan()
    owner.xHmiOpenHatch = False
    stock, payload = c.inventory(), (c.robot.xBlankAvailable, c.robot.xDetailAvailable)
    attempt = accept_once(c)
    for _ in range(25): c.scan()
    assert not any(c.errors().values()), c.errors()
    assert c.robot_block.ResetRecovery.udiAttempt == attempt
    assert c.inventory() == stock and (c.robot.xBlankAvailable, c.robot.xDetailAvailable) == payload
    restored = c.ready_for_start(max_resets=0)
    assert restored["ready"] and restored["resets"] == 0 and c.restart(), restored
