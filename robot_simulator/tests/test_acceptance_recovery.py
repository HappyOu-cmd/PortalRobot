"""Acceptance composition and causal recovery against the current ST owners."""
from __future__ import annotations

import pytest
import asyncio

from robot_simulator.plc_model.cell import Machine
from robot_simulator.plc_model.recovery import RecoveryCell
from robot_simulator.plc_model.st_runtime import Block
from robot_simulator.recovery_scenarios import recovery_scenarios
from robot_simulator.test_catalog import catalog
from robot_simulator.test_runner import GatewayRunner
from robot_simulator.test_scenarios import fixed_scenarios, for_magazine_mode, validate_inventory


@pytest.mark.parametrize("mode,count", [(0, 143), (1, 149)])
def test_acceptance_has_one_copy_of_each_case_and_a_mode_specific_production_tail(mode, count):
    cases = GatewayRunner.suite({"suite": "acceptance", "magazineMode": mode})
    assert len(cases) == count
    assert len({case["name"] for case in cases}) == count
    assert sum(c["expectations"].get("testKind") == "fault-recovery" for c in cases) == 66
    assert not any(c["expectations"]["firstDecision"] in ("initial-error", "robot-error-reset") for c in cases)
    assert all(bool(validate_inventory(c["initialState"])) == bool(c["expectations"].get("applyRejected")) for c in cases)
    entries = catalog(mode)["acceptance"]
    assert [e["name"] for e in entries] == [c["name"] for c in cases]
    assert sum(c["expectations"].get("testKind") == "general-four-batches" for c in cases) == (2 if mode == 0 else 0)
    assert GatewayRunner.suite({"suite": "acceptance", "magazineMode": mode, "fixedCaseIndex": count}) == [cases[-1]]


@pytest.mark.parametrize("suite", ["acceptance", "recovery"])
@pytest.mark.parametrize("environment,interface", [("simulation", "python-modbus"), ("sc500_bench", "sc500-modbus")])
def test_recovery_is_refused_before_plc_commands_in_an_incompatible_environment(suite, environment, interface):
    with pytest.raises(ValueError, match="SoftMotion"):
        GatewayRunner.suite({"suite": suite, "environment": environment, "robotInterface": interface})
    saved = fixed_scenarios("recovery")[0]
    with pytest.raises(ValueError, match="SoftMotion"):
        GatewayRunner.suite({"suite": "smoke", "scenarios": [saved], "environment": environment, "robotInterface": interface})


@pytest.mark.parametrize("changed", ["types", "gripper", "geometry"])
def test_a_saved_recovery_cannot_silently_use_fixed_type_answers_for_an_unsupported_initial_state(changed):
    case = recovery_scenarios()[0]
    state = case["initialState"]
    if changed == "types":
        state["typeCount"] = 2
    elif changed == "gripper":
        state["grippers"][0] = {"content": 1, "productType": 1}
    else:
        state["geometry"]["enabled"][0] = True
    with pytest.raises(ValueError, match="Recovery supports"):
        GatewayRunner.suite({"suite": "smoke", "scenarios": [case]})


def wait(cell, condition, limit=1000):
    for _ in range(limit):
        cell.scan()
        if condition():
            return
    raise AssertionError(("bounded scan limit", cell.errors(), cell.snapshot()))


def apply_cause(cell, spec):
    activation = spec["activation"]
    source, bit = spec["alarmSource"], spec["alarmCode"]
    if source in (2, 3, 4):
        block = cell.machine_blocks[source - 2]
        request = cell.machine_sim[source - 2].FaultRequest
        request.xEnabled = True
        field = "x" + activation["command"].split(".")[-1][0].upper() + activation["command"].split(".")[-1][1:]
        setattr(request, field, True)
        return lambda: block.Error.dwErrorActive, lambda: setattr(request, "xEnabled", False)
    if source in (5, 6):
        block = cell.magazines[source - 5]
        request = block.FaultRequest
        request.xEnabled = True
        field = {0: "xWrongOperation", 1: "xNoBlank", 2: "xNoFreeSlot", 3: "xInvalidSlot",
                 4: "xSlotContent", 7: "xGeometry"}[bit]
        setattr(request, field, True)
        return lambda: block.Error.dwErrorActive, lambda: setattr(request, "xEnabled", False)
    if source == 15:
        request = cell.robot_block.FaultRequest.stGripper
        request.xEnabled = True
        setattr(request, {0: "xGripper1Fault", 1: "xGripper2Fault", 2: "xRotationFault", 4: "xGlobalFault"}[bit], True)
        return lambda: cell.robot_block.fbGripper.Error.dwErrorActive, lambda: setattr(request, "xEnabled", False)
    if source == 14:
        request = cell.robot_block.FaultRequest.stPoint
        request.xEnabled = True
        setattr(request, ("xXOutOfLimit", "xYOutOfLimit", "xZOutOfLimit", "xInvalidVelocity")[bit], True)
        return lambda: cell.robot_block.stPointManager.Error.dwErrorLast, lambda: setattr(request, "xEnabled", False)
    if source == 1:
        request = cell.robot_block.FaultRequest
        request.xEnabled = request.xWrongAction = True
        return lambda: cell.robot_block.Error.dwErrorActive, lambda: setattr(request, "xEnabled", False)
    if source == 0:
        request = cell.manager.FaultRequest
        request.xEnabled = request.xBothGrippers = True
        return lambda: cell.manager.Error.dwErrorActive, lambda: setattr(request, "xEnabled", False)
    assert source == 16
    safety = Block(cell.registry, "FB/FB_CELL_SAFETY.st", cell.g)
    safety.xPhaseRelayOkInput = safety.xPressureRelayOkInput = safety.xSafetyRelayOkInput = True
    for i in range(1, 5):
        safety.axDoorLockClosedInput[i] = True
    safety.astMagazineStatus = cell.manager.astMagazineStatus
    if bit < 4:
        field, at, bad, good = "axEmergencyStopButtonStationInput", bit + 1, True, False
    elif bit < 6:
        field, at, bad, good = "axEmergencyStopCabinetInput", bit - 3, True, False
    elif bit < 10:
        field, at, bad, good = (("xEmergencyStopMpgInput", "xPhaseRelayOkInput", "xPressureRelayOkInput", "xSafetyRelayOkInput")[bit - 6], None, bit == 6, bit != 6)
    else:
        field, at, bad, good = "axDoorLockClosedInput", bit - 9, False, True
    def change(value):
        if at is None:
            setattr(safety, field, value)
        else:
            getattr(safety, field)[at] = value
    change(bad)
    original_scan = cell.scan
    def scan(dt=100):
        safety()
        cell.global_fault = safety.Status.xGlobalError
        original_scan(dt)
    cell.scan = scan
    return lambda: safety.Error.dwErrorActive, lambda: change(good)


@pytest.mark.parametrize("mode", [0, 1])
@pytest.mark.parametrize("case", recovery_scenarios(), ids=lambda case: f"source{case['expectations']['alarmSource']}-code{case['expectations']['alarmCode']}")
def test_each_declared_cause_forms_its_real_st_error_then_finishes_the_material(mode, case):
    state, spec = case["initialState"], case["expectations"]
    machines = [Machine({0: "disabled", 1: "empty", 3: "done"}[m["state"]]) for m in state["machines"]]
    stock = [[s["content"] for s in m["slots"][:4]] for m in state["magazines"]]
    cell = RecoveryCell(mode=mode, machines=machines, magazines=stock, geometry=(False, False), start=False)
    cell.manual = True
    for i, magazine in enumerate(cell.magazines):
        if not state["magazines"][i]["enabled"]:
            magazine.xHmiDisable = True
    for _ in range(5):
        cell.scan()
    for magazine in cell.magazines:
        magazine.xHmiDisable = False
    initial_counts = cell.inventory()
    activation = spec["activation"]
    delayed = activation.get("afterStart") or activation.get("machineBusy")
    if delayed:
        cell.manual = False
        cell.begin()
        wait(cell, lambda: cell.manager.Status.xRunning)
    if activation.get("machineBusy"):
        wait(cell, lambda: cell.machine_blocks[activation["machine"] - 1].Status.xBusy)
    error, repair = apply_cause(cell, spec)
    if spec["automaticFault"] and not delayed:
        cell.manual = False
        cell.begin()
    wait(cell, lambda: bool(error() & (1 << spec["alarmCode"])))
    cell.manual = True
    wait(cell, lambda: not cell.manager.Status.xRunning and not cell.robot.xBusy)
    assert not cell.manager.Status.xStartAllowed
    repair()
    for _ in range(8):
        cell.scan()
    stock_after = [[(s.xInPosition, s.eDetailType, s.uiProductType) for s in b.stInventory.aSlots.values] for b in cell.magazines]
    cargo_after = cell.robot.xBlankAvailable, cell.robot.xDetailAvailable
    shared_chuck = 0
    if spec["alarmSource"] in (2, 3, 4) and spec["alarmCode"] == 21:
        i = spec["alarmSource"] - 1
        if (cell.machine_sim[i - 1].Status.xChuckClamped and cell.robot.xBlankAvailable
                and cell.robot.xRotatedToBlank and cell.robot.eCurrentPoint == i * 4):
            shared_chuck = i
    expected_counts = initial_counts.copy()
    if shared_chuck:
        expected_counts[1] += 1
    assert cell.inventory() == expected_counts
    # Exactly one accepted common Reset; no second Reset to hide a dependency race.
    cell.pulse_reset()
    assert not any(cell.errors().values()), cell.errors()
    assert not cell.manager.Status.xRunning
    assert stock_after == [[(s.xInPosition, s.eDetailType, s.uiProductType) for s in b.stInventory.aSlots.values] for b in cell.magazines]
    assert cargo_after == (cell.robot.xBlankAvailable, cell.robot.xDetailAvailable)
    if shared_chuck:
        block = cell.machine_blocks[shared_chuck - 1]
        assert block.Status.xManualChuckOpenAllowed
        block.xHmiOpenChuck = True
        cell.scan()
        block.xHmiOpenChuck = False
        wait(cell, lambda: block.stMachineStatus.xChuckUnclamped and not block.stMachineStatus.xChuckClamped)
        assert cell.inventory() == initial_counts
    assert cell.move_home()
    for twin in cell.twins:
        assert twin.restore()["ready"]
    for i, m in enumerate(state["machines"], 1):
        if m["state"]:
            assert cell.restore_machine(i)
    for i, magazine in enumerate(cell.magazines):
        magazine.xHmiEnable = state["magazines"][i]["enabled"]
    cell.scan()
    for magazine in cell.magazines:
        magazine.xHmiEnable = False
    cell.manual = False
    for _ in range(3):
        cell.scan()
    produced = sum(b.Status.udiProducedPartsTotal for b in cell.magazines)
    assert cell.restart(), cell.snapshot()
    def completed():
        details = [s for b in cell.magazines for s in b.stInventory.aSlots.values if s.xInPosition]
        return len(details) == sum(initial_counts.values()) and all(s.eDetailType == 2 for s in details)
    wait(cell, completed, limit=1800)
    cell.stop = True
    cell.scan()
    cell.stop = False
    wait(cell, lambda: not cell.manager.Status.xRunning and not cell.robot.xBusy)
    assert not any(cell.errors().values()), cell.errors()
    assert cell.inventory() == initial_counts
    assert sum(b.Status.udiProducedPartsTotal for b in cell.magazines) > produced
    details = [s for b in cell.magazines for s in b.stInventory.aSlots.values if s.xInPosition]
    assert len(details) == sum(initial_counts.values())
    assert all(s.eDetailType == cell.registry.enums["E_DETAIL_TYPE"].DETAIL for s in details)


class StRecoveryTransport(GatewayRunner):
    """Run the production recovery orchestrator against ST-owned snapshots.

    The command transport and alarm publication are in memory. Actual owners,
    material feedback and recovery commands execute ST; no live service starts.
    """
    def __init__(self, case, *, mode=0, roles=(1, 1)):
        self.case, self.values, self.case_checks, self.commands = for_magazine_mode(case, mode), {}, [], []
        self.environment, self.robot_interface, self.speed_profile = "simulation", "softmotion", "realtime"
        self._simulator_session_acquired = False
        state = self.case["initialState"]
        self.cell = RecoveryCell(start=False, geometry=(False, False), mode=mode, roles=roles,
            machines=[Machine({0: "disabled", 1: "empty", 3: "done"}[m["state"]]) for m in state["machines"]],
            magazines=[[s["content"] for s in magazine["slots"][:4]] for magazine in state["magazines"]])
        self.cell.manual = True
        for i, b in enumerate(self.cell.magazines):
            b.xHmiDisable = not state["magazines"][i]["enabled"]
            if mode and not state["magazines"][i]["enabled"]:
                assert self.cell.twins[i].command("xDisable")
        for _ in range(5):
            self.cell.scan()
        for b in self.cell.magazines:
            b.xHmiDisable = False
        self.error, self.repair, self.detected = None, None, False
        self.sync()

    def sync(self):
        def fields(root, record):
            for key, value in vars(record).items():
                if not key.startswith("_"):
                    if isinstance(value, (bool, int, float)):
                        self.values[root + "." + key] = value
                    elif hasattr(value, "_types"):
                        fields(root + "." + key, value)
        c = self.cell
        fields("stCellStatus", c.manager.Status)
        fields("stRobotStatus", c.robot)
        fields("stCellFaultStatus", c.manager.FaultStatus)
        fields("stPointFaultStatus", c.robot_block.FaultStatus.stPoint)
        fields("stRobotFaultStatus", c.robot_block.FaultStatus.stRobot)
        for i, b in enumerate(c.machine_blocks, 1):
            fields(f"astMachineStatus[{i}]", b.Status)
            fields(f"astMachineDiag[{i}]", b.Diag)
            fields(f"astMachineIoStatus[{i}]", b.stMachineStatus)
            self.values[f"stMultiType.Config.auiMachineType[{i}]"] = 1
        for i, b in enumerate(c.magazines, 1):
            fields(f"astMagazineStatus[{i}]", c.public_magazines[i] if c.mode else b.Status)
            if c.mode:
                fields(f"astTwinStatus[{i}]", c.twins[i - 1].block.Status)
                inventories = [(f"astTwinStore[{i}].astPallet[{p}]", c.twin.astStore[i].astPallet[p]) for p in (1, 2)]
            else:
                inventories = [(f"astMagazineInventory[{i}]", b.stInventory)]
            for root, inventory in inventories:
                for slot, item in enumerate(inventory.aSlots.values, 1):
                    fields(f"{root}.aSlots[{slot}]", item)
        if self.error and self.error() & (1 << self.case["expectations"]["alarmCode"]):
            self.detected = True
        self.values.update({"uiMagazineMode": c.mode, "stTestScenario.udiLoadSeq": 1,
            "xGlobalError": c.global_fault, "astAlarmEvent[1].udiSequence": int(self.detected),
            "astAlarmEvent[1].eSeverity": 0,
            "astAlarmEvent[1].eSource": self.case["expectations"]["alarmSource"],
            "astAlarmEvent[1].uiCode": self.case["expectations"]["alarmCode"],
            "astAlarmEvent[1].xActive": self.detected and any(c.errors().values()),
            # Publication of common permission is represented here; its final
            # acceptance is independently checked by every real owner on Reset.
            "stCellStatus.xResetAllowed": any(c.errors().values()) and not c.global_fault})

    async def send(self, socket, payload):
        pass

    async def wait_value(self, socket, predicate, timeout, label):
        self.sync()
        for _ in range(1800):
            if predicate(self.values):
                return
            self.cell.scan()
            self.sync()
        raise TimeoutError((label, self.cell.snapshot(), self.cell.errors()))

    async def wait_stable_value(self, socket, predicate, timeout, label, **kwargs):
        await self.wait_value(socket, predicate, timeout, label)
        for _ in range(8):
            self.cell.scan()
            self.sync()
            if not predicate(self.values):
                raise AssertionError(("unstable feedback", label))

    async def command(self, socket, command, **fields):
        self.commands.append(command)
        c = self.cell
        if command == "fault.enable":
            for request in (c.manager.FaultRequest, c.robot_block.FaultRequest.stPoint,
                            c.robot_block.FaultRequest):
                request.xEnabled = True
        elif command.startswith("fault."):
            self.error, self.repair = apply_cause(c, self.case["expectations"])
        elif command == "test.faults.clear":
            self.repair()
        elif command == "cell.reset":
            c.pulse_reset()
        elif command == "cell.stop":
            c.stop = True
            c.scan()
            c.stop = False
        elif command == "cell.operatorChoice":
            c.manager.uiOperatorChoice, c.manager.xOperatorChoice = fields["value"], True
            c.scan()
            c.manager.xOperatorChoice = False
        elif command.startswith("machine."):
            b = c.machine_blocks[fields["machine"] - 1]
            name = {"enable": "xHmiEnable", "setBlank": "xHmiSetBlank", "setDetail": "xHmiSetDetail",
                    "acceptDoor": "xHmiAcceptDoor", "acceptRun": "xHmiAcceptRunCNC",
                    "manualChuckOpen": "xHmiOpenChuck", "manualHatchOpen": "xHmiOpenHatch"}[command.split(".")[1]]
            setattr(b, name, True)
            c.scan()
            setattr(b, name, False)
        elif command == "magazine.enable":
            if c.mode:
                assert c.twins[fields["magazine"] - 1].command("xEnable")
            b = c.magazines[fields["magazine"] - 1]
            b.xHmiEnable = True
            c.scan()
            b.xHmiEnable = False
        elif command == "twin.command":
            assert fields["action"] == 2
            plant = c.twins[fields["magazine"] - 1]
            assert fields["value"] == plant.block.Status.uiCandidate
            assert fields["revision"] == plant.block.Status.udiRevision
            assert plant.command("xConfirm")
        else:
            raise AssertionError(command)
        c.scan()
        self.sync()

    async def ensure_manual_control(self, socket):
        self.cell.manual = True
        self.cell.scan()
        self.sync()

    async def ensure_softmotion_drives(self, socket):
        assert not self.cell.group.Status.xLocalError

    async def ensure_safety_home(self, socket):
        assert self.cell.move_home()
        self.sync()

    async def start_automatic_cycle(self, socket, **kwargs):
        self.commands.append("cell.start")
        self.cell.manual = False
        for _ in range(3):
            self.cell.scan()
        self.cell.begin()
        self.sync()
        await self.wait_value(socket, lambda v: v["stCellStatus.xRunning"] or v["stCellStatus.xOperatorPromptActive"], 20, "Start not accepted")


@pytest.mark.parametrize("source,code", [(2, 14), (2, 20), (2, 21), (2, 22), (2, 24), (15, 0), (14, 0), (16, 9)])
def test_runtime_recovery_orchestrator_finishes_actual_st_material_without_reloading(source, code):
    case = next(c for c in recovery_scenarios()
                if (c["expectations"]["alarmSource"], c["expectations"]["alarmCode"]) == (source, code))
    runner = StRecoveryTransport(case)
    asyncio.run(runner.run_fault_recovery(None, case, 1, 1, runner.initial_inventory(case["initialState"])))
    assert runner.commands.count("cell.reset") == 1
    assert not any(runner.cell.errors().values())


@pytest.mark.parametrize("roles", [(1, 1), (1, 2), (2, 1), (2, 2)])
def test_runtime_recovery_restores_confirmed_pallets_in_every_physical_role_after_a_safety_fault(roles):
    case = next(c for c in recovery_scenarios()
                if (c["expectations"]["alarmSource"], c["expectations"]["alarmCode"]) == (16, 9))
    runner = StRecoveryTransport(case, mode=1, roles=roles)
    case = runner.case
    asyncio.run(runner.run_fault_recovery(None, case, 1, 1, runner.initial_inventory(case["initialState"])))
    assert runner.commands.count("cell.reset") == 1
    assert runner.commands.count("twin.command") == 2
    assert tuple(p.block.Status.uiRobotPallet for p in runner.cell.twins) == roles
    assert not any(runner.cell.errors().values())
