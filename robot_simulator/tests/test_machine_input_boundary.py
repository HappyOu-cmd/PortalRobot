"""Physical DI must survive every HMI test request; virtual latches stay resettable."""
from itertools import product

import pytest

from robot_simulator.plc_model.machine_inputs import MachineInputRig
from robot_simulator.plc_model.st_runtime import Block, Registry


@pytest.fixture(scope="module")
def registry():
    return Registry()


@pytest.mark.parametrize("environment,index,raw_alarm,enabled,mask,error,reset", list(product(
    ("NORMAL", "SIMULATION", "SC500_BENCH"), (1, 2, 3), (False, True), (False, True),
    range(8), (False, True), (False, True))))
def test_machine_input_environment_matrix(registry, environment, index, raw_alarm, enabled, mask, error, reset):
    rig = MachineInputRig(registry)
    rig.settings.eTestEnvironment = getattr(registry.enums["E_CELL_TEST_ENVIRONMENT"], environment)
    rig.hmi.xErrorSimulationEnable = enabled
    rig.fault_mask(index, mask)
    rig.seed_alarm(index, raw_alarm)
    owner = rig.owners[index - 1]
    if error:
        owner.eState = registry.enums["E_MACHINE_STATE"].ERROR
        owner.Error.dwErrorActive = owner.ERR_MACHINE_IDLE
    rig.control.xReset = reset
    rig.scan()
    # MachineAlarm can create a new simulator alarm while stationary. Door/
    # chuck faults require their real mechanism action, tested separately.
    virtual_raw = raw_alarm or (enabled and bool(mask & 1))
    expected = raw_alarm if environment == "NORMAL" else virtual_raw and enabled and bool(mask)
    public = rig.machine.Status[index]
    injector = rig.injectors[index - 1]
    assert rig.environment["astMachineStatusRaw"][index].xAlarm == (raw_alarm if environment == "NORMAL" else virtual_raw)
    assert injector.MachineStatus.xAlarm == expected
    assert owner.stMachineStatus.xAlarm == public.stIo.xAlarm == public.xAlarm == expected
    assert injector.Status.xAllowed == (enabled and environment != "NORMAL")
    if expected:
        assert owner.Status.xError and owner.Error.dwErrorActive
        assert not owner.Status.xCanAcceptService and not owner.Status.xResetAllowed
    elif error:
        assert bool(owner.Error.dwErrorActive) == (not reset)
    else:
        assert not owner.Error.dwErrorActive and owner.Status.xCanAcceptService
    assert not owner.Command.stRobot.xExecute and not owner.Command.stIo.xStartCycle


@pytest.mark.parametrize("index,local", list(product((1, 2, 3), (False, True))))
def test_physical_alarm_repair_requires_a_new_reset_and_explicit_enable(registry, index, local):
    rig = MachineInputRig(registry)
    rig.settings.eTestEnvironment = registry.enums["E_CELL_TEST_ENVIRONMENT"].NORMAL
    rig.seed_alarm(index, True)
    rig.scan()
    owner = rig.owners[index - 1]
    assert owner.Error.dwErrorActive == owner.ERR_MACHINE_IDLE
    for _ in range(3):
        rig.control.xReset = not local
        rig.hmi.axMachineReset[index] = local
        rig.scan()
        assert owner.Error.dwErrorActive and not owner.Status.xResetAllowed
    rig.seed_alarm(index, False)
    rig.control.xReset = rig.hmi.axMachineReset[index] = False
    rig.scan()
    assert owner.Error.dwErrorActive and owner.Status.xResetAllowed
    rig.control.xReset = not local
    rig.hmi.axMachineReset[index] = local
    rig.scan()
    assert not owner.Error.dwErrorActive
    assert owner.eState == registry.enums["E_MACHINE_STATE"].DISABLED
    assert not owner.Command.stRobot.xExecute and not owner.Command.stIo.xStartCycle
    rig.control.xReset = rig.hmi.axMachineReset[index] = False
    rig.hmi.axMachineEnable[index] = True
    rig.scan()
    assert owner.Status.xCanAcceptService


@pytest.mark.parametrize("environment,index,cause", list(product(
    ("SIMULATION", "SC500_BENCH"), (1, 2, 3), ("alarm", "door", "chuck"))))
def test_virtual_live_fault_keeps_owner_latched_after_cause_removal(registry, environment, index, cause):
    rig = MachineInputRig(registry)
    rig.settings.eTestEnvironment = getattr(registry.enums["E_CELL_TEST_ENVIRONMENT"], environment)
    rig.hmi.xErrorSimulationEnable = True
    rig.fault_mask(index, {"alarm": 1, "door": 2, "chuck": 4}[cause])
    simulation, owner = rig.simulations[index - 1], rig.owners[index - 1]
    if cause == "door":
        simulation.xDoorOpening = True
    elif cause == "chuck":
        simulation.xChuckClamping = True
    rig.scan()
    assert simulation.Error.dwErrorActive and owner.Status.xError
    assert not owner.Status.xResetAllowed
    rig.fault_mask(index, 0)
    rig.scan()
    assert simulation.Status.xAlarm  # The simulator's own error is still latched.
    assert not owner.stMachineStatus.xAlarm and owner.Status.xResetAllowed
    assert owner.Error.dwErrorActive  # Removing the cause is not an owner Reset.
    rig.control.xReset = True
    rig.scan()
    assert not owner.Error.dwErrorActive and not owner.Command.stRobot.xExecute
    rig.control.xReset = False
    rig.hmi.axMachineEnable[index] = True
    for _ in range(3): rig.scan()
    assert not simulation.Error.dwErrorActive and owner.Status.xCanAcceptService
    rig.hmi.axMachineEnable[index] = False
    rig.fault_mask(index, 1)
    rig.scan()
    assert owner.Error.dwErrorActive and not owner.Status.xResetAllowed


@pytest.mark.parametrize("raw_alarm,enabled,mask", list(product((False, True), (False, True), range(8))))
def test_physical_injector_ignores_forged_fault_requests_and_restores_nominal_data(registry, raw_alarm, enabled, mask):
    rig = MachineInputRig(registry)
    injector = rig.injectors[0]
    request = registry.value("ST_MACHINE_FAULT_REQUEST", {})
    for name in request._types:
        setattr(request, name, name.startswith("xTimeout"))
    request.xEnabled = enabled
    request.xMachineAlarm, request.xDoorFault, request.xChuckFault = (bool(mask & (1 << n)) for n in range(3))
    raw = rig.machine.astPhysicalInput[1]
    raw.xAlarm = raw_alarm
    robot = rig.robot
    robot.xDone = True
    robot.xGripper1Open = robot.xGripper2Closed = robot.xRotatedToBlank = True
    # First poison every output with the virtual timeout profile. The next
    # physical scan must copy complete snapshots, including cleared fields.
    injector(xUsePhysicalInput=False, Request=request, MachineStatusRaw=raw,
             RobotStatusRaw=robot, NominalTimeouts=rig.settings.stMachineTimeouts)
    injector(xUsePhysicalInput=True)
    for target, original in ((injector.MachineStatus, raw), (injector.RobotStatus, robot),
                              (injector.Timeouts, rig.settings.stMachineTimeouts)):
        assert vars(target) == vars(original)
    assert not any(getattr(injector.Status, name) for name in injector.Status._types)


def test_machine_injector_defaults_to_the_physical_source(registry):
    injector = Block(registry, "FB/FB_FAULT_INJECTOR/FB_MACHINE_FAULT_INJECTOR.st", {})
    injector.MachineStatusRaw.xAlarm = True
    injector()
    assert injector.MachineStatus.xAlarm and not injector.Status.xAllowed


@pytest.mark.parametrize("environment,index,alarm", list(product(
    ("SIMULATION", "SC500_BENCH"), (1, 2, 3), (False, True))))
def test_environment_switch_restores_physical_feedback_and_timeouts(registry, environment, index, alarm):
    rig = MachineInputRig(registry)
    rig.settings.eTestEnvironment = getattr(registry.enums["E_CELL_TEST_ENVIRONMENT"], environment)
    rig.hmi.xErrorSimulationEnable = True
    for name in rig.hmi._types:
        if name.startswith("axMachineTimeout"):
            getattr(rig.hmi, name)[index] = True
    rig.fault_mask(index, 1)
    rig.scan()
    injector = rig.injectors[index - 1]
    assert injector.MachineStatus.xAlarm and injector.Timeouts.tDoorOpen == 2000
    rig.settings.eTestEnvironment = registry.enums["E_CELL_TEST_ENVIRONMENT"].NORMAL
    rig.machine.astPhysicalInput[index].xAlarm = alarm
    rig.scan()
    assert not rig.settings.xErrorSimulationEnabled
    assert vars(injector.MachineStatus) == vars(rig.machine.astPhysicalInput[index])
    assert vars(injector.RobotStatus) == vars(rig.robot)
    assert vars(injector.Timeouts) == vars(rig.settings.stMachineTimeouts)
    assert rig.machine.Status[index].stIo.xAlarm == alarm
    assert not injector.Status.xActive and not injector.Status.xAllowed
    rig.settings.eTestEnvironment = getattr(registry.enums["E_CELL_TEST_ENVIRONMENT"], environment)
    rig.scan()
    assert injector.MachineStatus.xAlarm and injector.Timeouts.tDoorOpen == 2000
