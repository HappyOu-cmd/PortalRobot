"""Executable ST dispatcher, magazines and GK with abstract machine/motion I/O.

The machine service and robot motion are bounded, successful environment
transitions. Their recipes, SoftMotion, Modbus and physical safety are NOT
verified here. The cell/stock/GK decisions themselves execute working ST.
"""
from __future__ import annotations

import copy
from collections import Counter
from dataclasses import dataclass

from .st_runtime import Block, Program, Record, Registry, StArray, declarations


def record(**values):
    return Record({k: "BOOL" if isinstance(v, bool) else "UDINT" if k.startswith("udi") else "UINT" if isinstance(v, int) else "RECORD" for k, v in values.items()}, values)


def global_record(registry, relative, environment, names=None):
    source = (registry.root / relative).read_text(encoding="utf-8-sig")
    decls = [d for d in declarations(source) if names is None or d.name in names]
    return Record({d.name: d.type for d in decls}, registry.initialize(decls, environment))


@dataclass(frozen=True)
class Machine:
    mode: str = "empty"
    product: int = 1
    remaining: int = 5
    timed: bool = True


class Cell:
    def __init__(self, *, types=1, machines=None, magazines=None, enabled=(True, True),
                 geometry=(False, False), mode=0, roles=(1, 1), operator=None,
                 slots=None, registry=None, autostart=True):
        self.registry = registry or Registry()
        r = self.registry
        r.clock.now = 0
        self.clock, self.types, self.mode = r.clock, types, mode
        self.slots = slots or (96 if mode else 4)
        self.trace, self.states, self.operations = [], set(), Counter()
        self.scans, self.removed, self.robot_job = 0, Counter(), None
        self.service_jobs, self.processing = {}, {}
        self.swaps, self.swap_jobs = [True, True], {}
        self.g = {}
        self.g["GVL_CELL_SETTINGS"] = global_record(r, "GVL/GVL_CELL_SETTINGS.gvl.st", self.g,
            {"MagazineCount", "MagazineSlots", "NumberDetail"})
        self.g["Persistent_Value"] = global_record(r, "Persistent_Value.gvl.st", self.g,
            {"udiNextCallId", "udiEventSequence", "xAutoEnabled", "auiPeriod", "xWaitWhenOccupied",
             "tTransportTimeout", "tDriveFeedbackTimeout", "tResetPulse", "tWaitWarningTimeout"})
        self.g["GVL_GEOMETRY_CONTROL"] = global_record(r, "GVL/GVL_GEOMETRY_CONTROL.gvl.st", self.g)
        self.g["GVL_TWO_PALLET"] = global_record(r, "GVL/GVL_TWO_PALLET.gvl.st", self.g,
            {"uiMode", "astStatus", "astStore"})
        self.g["GVL_TWO_PALLET"].uiMode = mode
        self.g["GVL_HMI"] = record(uiGeometryResult=0, udiHmiCommandClockMs=0, xTestSessionActive=False)
        self.g["GVL_ALARM"] = record(Command=r.value("ST_ALARM_COMMAND", self.g))
        self.manager = Block(r, "FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st", self.g)
        m = self.manager
        self.g["GVL_MULTI_TYPE"] = record(Config=m.Config)
        self.g["GVL_MACHINE"] = record(Status=m.astMachineStatus)
        self.g["GVL_ROBOT"] = record(Status=m.stRobotStatus)
        self.g["GVL_CELL_CONTROL"] = record(xStop=False, xManual=False)
        self.g["GVL_CELL_MANAGER"] = record(Status=m.Status, Diag=m.Diag)
        m.state.update(self.g)
        for name in ("F_GEOMETRY_EVENT", "F_GEOMETRY_SELECT_STATION", "F_GEOMETRY_TAKE_DETAIL"):
            m.state[name] = m._method(r.program("FB/" + name + ".st"))
        self.geometry = self.g["GVL_GEOMETRY_CONTROL"]
        self.persistent = self.g["Persistent_Value"]
        self.twin = self.g["GVL_TWO_PALLET"]
        self.robot = m.stRobotStatus
        self.robot.eCurrentPoint = r.enums["E_POINT_NAME"].HOME_SAFETY
        self.robot.xGripper1Open = self.robot.xGripper2Open = True
        self.robot.xRotatedToBlank = True
        m.Config.uiTypeCount = types
        for name in ("xSafetyReady", "xDrivesReady", "xRobotInterfaceReady", "xConfigurationValid", "xPointsConfigured"):
            setattr(m, name, True)
        m.lrSafetyHomeToleranceX = m.lrSafetyHomeToleranceY = m.lrSafetyHomeToleranceZ = 5.0
        m.lrStoppedPoseTolerance = 1.0
        self.machine_specs = list(machines or [Machine(product=1 + i % types) for i in range(3)])
        for index, spec in enumerate(self.machine_specs, 1):
            self.set_machine(index, spec)
        self.magazines = []
        self.public_magazines = m.astMagazineStatus
        magazines = magazines or [[1] * self.slots, [1] * self.slots]
        for index in (1, 2):
            magazine = Block(r, "FB/FB_MAGAZINE.st", m.state)
            self.magazines.append(magazine)
            magazine.uiMagazineId = index
            magazine.uiRows, magazine.uiColumns = (12, self.slots // 12) if self.slots % 12 == 0 else (self.slots, 1)
            magazine.uiTypeCount = types
            magazine.xPointsConfigured = magazine.xRobotCanWorkWithMagazine = True
            magazine.lrPitchX = magazine.lrPitchY = 60.0
            magazine.state["stRobotStatus"] = self.robot
            magazine.state["astMachineStatus"] = m.astMachineStatus
            magazine.state["auiMachineType"] = m.Config.auiMachineType
            for slot in range(1, 121):
                magazine.auiSlotType[slot] = 1 + (slot - 1) % types
            twin_status = self.twin.astStatus[index]
            twin_status.uiRobotPallet = roles[index - 1]
            twin_status.xReady = twin_status.xEnabled = enabled[index - 1]
            if mode:
                store = self.twin.astStore[index]
                magazine.state["stInventory"] = store.astPallet[roles[index - 1]]
                other = 3 - roles[index - 1]
                self.fill(store.astPallet[other], (operator or [[], []])[index - 1])
                store.axLoaded[other] = bool((operator or [[], []])[index - 1])
            self.fill(magazine.stInventory, magazines[index - 1])
            magazine(xTestInitialize=True, xTestEnabled=enabled[index - 1])
            magazine.xTestInitialize = False
            self.public_magazines[index] = magazine.Status
        self.g["GVL_MAGAZINE"] = record(astPartStatus=StArray(1, [x.Status for x in self.magazines], "ST_MAGAZINE_STATUS"),
            astAutoCommand=StArray(1, [r.value("ST_MAGAZINE_COMMAND", self.g) for _ in range(2)], "ST_MAGAZINE_COMMAND"),
            astCommand=StArray(1, [x.Command for x in self.magazines], "ST_ROBOT_COMMAND"))
        m.state.update(self.g)
        self.stations, self.station_sim = [], []
        self.geometry.xSupported = True
        for index, active in enumerate(geometry, 1):
            station = Block(r, "FB/FB_GEOMETRY_CONTROL.st", m.state)
            simulation = Block(r, "FB/FB_GEOMETRY_CONTROL_SIMULATION.st", m.state)
            station.xSupported = station.xSimulation = station.xHmiAlive = True
            station.Config.xConfigured = True
            station.tTransport, station.tFeedback, station.tResetPulse = 10000, 3000, 1000
            station.state["Signals"] = self.geometry.astSignals[index]
            station.state["F_GEOMETRY_EVENT"] = m.state["F_GEOMETRY_EVENT"]
            station()
            if active:
                station(uiAction=3); station(uiAction=1); station(uiAction=0)
            self.stations.append(station); self.station_sim.append(simulation)
            self.geometry.astStatus[index] = station.Status
        self._compile_adapters()
        self.initial_inventory = self.inventory()
        self.initial_inventory_total = sum(self.initial_inventory.values())
        if autostart:
            self.start()

    def _compile_adapters(self):
        r, m = self.registry, self.manager
        text = (r.root / "PLC_PRG.RunGeometryControl.st").read_text(encoding="utf-8-sig")
        gates = text[text.index("FOR uiGeometryMachine := UINT#1 TO UINT#3 DO", text.index("GVL_GEOMETRY_CONTROL.xAutoChangeAllowed :=")):text.index("// Упакованный канал")]
        call = text[text.index("IF (stGeometryRequest.uiAction = UINT#8)"):text.index("ELSIF (stGeometryRequest.uiAction = UINT#9)")]
        self.call_gates = Program(gates, "RunGeometryControl:call-gates")
        self.call_command = Program(call + "END_IF;", "RunGeometryControl:call/cancel")
        text = (r.root / "PLC_PRG.RunTwoPallet.st").read_text(encoding="utf-8-sig")
        self.swap_request = Program(text[text.index("xTwinRobotOperation :="):text.index("uiTwinRobotPalletBefore :=")], "RunTwoPallet:auto-swap-request")
        self.adapter = {**m.state, "_types": {}, "xMotionBusy": False, "xTwinInventoryCommand": False,
            "stTwinRequest": r.value("ST_TWO_PALLET_REQUEST", self.g),
            "astTwinCommand": r.value("ARRAY [1..2] OF ST_TWO_PALLET_COMMAND", self.g),
            "axTwinAutoSwapPending": m.axMagazineAutoSwapPending,
            "stGeometryRequest": r.value("ST_GEOMETRY_REQUEST", self.g),
            "stGeometryCall": r.value("ST_GEOMETRY_CALL", self.g),
            "stGeometryEmptyCall": r.value("ST_GEOMETRY_CALL", self.g)}

    def fill(self, inventory, contents):
        for index, value in enumerate(contents, 1):
            content, product = value if isinstance(value, (tuple, list)) else (1, value) if value > 0 else (2, -value) if value < 0 else (0, 0)
            slot = inventory.aSlots[index]
            slot.xInPosition, slot.eDetailType, slot.uiProductType = bool(content), content, product

    def set_machine(self, index, spec):
        m, r = self.manager, self.registry
        status = r.value("ST_MACHINE_PUBLIC", self.g)
        m.astMachineStatus[index] = status
        status = m.astMachineStatus[index]
        m.Config.auiMachineType[index] = spec.product
        status.eAbovePoint = getattr(r.enums["E_POINT_NAME"], f"MACHINE_{index}_ABOVE")
        status.ePartState = r.enums["E_PART_STATE"].EMPTY if spec.mode in ("empty", "disabled", "error") else r.enums["E_PART_STATE"].LOADED
        status.ePartType = r.enums["E_PART_TYPE"].DETAIL if spec.mode == "done" else r.enums["E_PART_TYPE"].PART if spec.mode in ("processing", "pending", "unready") else 0
        status.xEnabled = spec.mode != "disabled"
        status.xError = spec.mode == "error"
        status.xDisablePending = spec.mode == "disabling"
        status.xProcessing = spec.mode == "processing"
        status.xPartReady = spec.mode == "done"
        status.xCanAcceptService = spec.mode in ("empty", "done")
        status.xServiceRequired = status.xCanAcceptService
        status.eRecommendedOperation = r.enums["E_MACHINE_OPERATION"].CHANGE if spec.mode == "done" else r.enums["E_MACHINE_OPERATION"].LOAD
        status.xCycleTimeValid, status.tCycleExpected = spec.timed, 1000 * spec.remaining
        status.tRemaining = 1000 * spec.remaining if status.xProcessing else 0
        m.axMachineStartPending[index] = spec.mode == "pending"
        if spec.mode in ("processing", "pending"):
            self.processing[index] = max(1, spec.remaining)
        else:
            self.processing.pop(index, None)

    def hold(self, blank=0, detail=0):
        robot = self.robot
        robot.xBlankAvailable, robot.uiBlankPayloadType = bool(blank), blank
        robot.xDetailAvailable, robot.uiDetailPayloadType = bool(detail), detail
        robot.xGripper1Open, robot.xGripper1Closed = not blank, bool(blank)
        robot.xGripper2Open, robot.xGripper2Closed = not detail, bool(detail)

    def start(self):
        self.manager(xStart=True)
        self.manager.xStart = False
        self.manager()

    def call(self, machine, *, cancel=False):
        self.geometry.xAutoChangeAllowed = not self.manager.xGlobalError
        self.call_gates.execute(self.adapter)
        request = self.adapter["stGeometryRequest"]
        request.uiMachine, request.uiAction = machine, 12 if cancel else 8
        self.g["GVL_HMI"].uiGeometryResult = 2
        self.call_command.execute(self.adapter)
        self.trace.append({"scan": self.scans, "event": "cancel" if cancel else "call", "machine": machine,
                           "accepted": self.g["GVL_HMI"].uiGeometryResult == 1})
        return self.g["GVL_HMI"].uiGeometryResult == 1

    def _twins(self):
        if not self.mode:
            return
        m = self.manager
        for index, magazine in enumerate(self.magazines, 1):
            status = self.twin.astStatus[index]
            self.adapter.update({"uiTwin": index, "xTwinAutoSwapEnabled": self.swaps[index - 1], "CELL_MANAGER": m})
            self.swap_request.execute(self.adapter)
            pending = m.axMagazineAutoSwapPending[index]
            if index in self.swap_jobs:
                self.swap_jobs[index] -= 1
                if self.swap_jobs[index] == 0:
                    del self.swap_jobs[index]
                    status.uiRobotPallet = 3 - status.uiRobotPallet
                    self.twin.astStore[index].axLoaded[status.uiRobotPallet] = False
                    magazine.state["stInventory"] = self.twin.astStore[index].astPallet[status.uiRobotPallet]
                    magazine.xInventoryChanged = True
                    status.xBusy = False; status.xCompleted = True
                    self.trace.append({"scan": self.scans, "event": "swap", "magazine": index, "pallet": status.uiRobotPallet})
                else:
                    status.xCompleted = False
            elif status.xCompleted:
                status.xCompleted = False
            elif pending and self.swaps[index - 1] and self.adapter["xTwinOtherLoaded"] and self.adapter["xTwinOtherHasBlank"] and self.adapter["xTwinRobotSwapWindow"]:
                self.swap_jobs[index] = 3; status.xBusy = True
            status.xReady = status.xEnabled and not status.xBusy and not status.xCompleted
            m.axMagazineExchangeInProgress[index] = status.xBusy or status.xCompleted
            magazine.xMechanismReady = status.xReady
        m.xMagazineExchangeActive = any(m.axMagazineExchangeInProgress.values)

    def _geometry_scan(self):
        m = self.manager
        self.g["GVL_HMI"].udiHmiCommandClockMs = self.clock.now
        for index, (station, simulation) in enumerate(zip(self.stations, self.station_sim), 1):
            signals = self.geometry.astSignals[index]
            simulation(xRun=station.xRunOutput, xReset=station.xResetOutput, xDeposited=signals.xDeposited,
                       udiPartId=signals.Call.udiId, xRemove=station.xSimulationEmptyConfirmed)
            station.xGlobalError, station.xCellRunning = m.xGlobalError, m.xRunning
            station.xRobotBusy, station.xMotionBusy = self.robot.xBusy, m.xMotionBusy
            station.xManual, station.xIoManual = m.xManual, m.xIoManual
            station.xDriveAlarm, station.xDriveRunning = simulation.xDriveAlarm, simulation.xDriveRunning
            station.xPartAtEnd, station.rSimulationTravel = simulation.xPartAtEnd, simulation.rTravel
            before = station.Memory.xOccupied
            product = station.Memory.Part.uiProductType
            station()
            if before and not station.Memory.xOccupied:
                self.removed[product] += 1
            station.uiAction = 0
            self.geometry.astStatus[index] = station.Status

    def _machine_scan(self):
        """Successful service environment; not a translation of FB_MACHINE."""
        m, enums = self.manager, self.registry.enums
        for index in range(1, 4):
            status = m.astMachineStatus[index]
            execute = m.Command.axMachineExecute[index]
            if index in self.service_jobs:
                operation, step = self.service_jobs[index]
                if step == 1 and operation in (enums["E_MACHINE_OPERATION"].CHANGE, enums["E_MACHINE_OPERATION"].UNLOAD):
                    assert not self.robot.xDetailAvailable, "Machine attempted to overwrite gripper 2"
                    self.hold(self.robot.uiBlankPayloadType, m.Config.auiMachineType[index])
                    status.ePartState, status.ePartType = enums["E_PART_STATE"].EMPTY, 0
                if step == 3:
                    if operation in (enums["E_MACHINE_OPERATION"].CHANGE, enums["E_MACHINE_OPERATION"].LOAD):
                        assert self.robot.xBlankAvailable and self.robot.uiBlankPayloadType == m.Config.auiMachineType[index], "Incompatible machine loading"
                        self.hold(0, self.robot.uiDetailPayloadType)
                        status.ePartState, status.ePartType = enums["E_PART_STATE"].LOADED, enums["E_PART_TYPE"].PART
                    status.xRobotReleased = True
                if step >= 3 and not execute:
                    del self.service_jobs[index]
                    status.xBusy = status.xRobotReleased = False
                    if operation != enums["E_MACHINE_OPERATION"].UNLOAD:
                        status.xProcessing = True
                        self.processing[index] = max(2, self.machine_specs[index - 1].remaining)
                    else:
                        status.xCanAcceptService = status.xServiceRequired = True
                else:
                    self.service_jobs[index] = operation, step + 1
            elif execute:
                assert not status.xError and status.xEnabled and not status.xDisablePending, "Command to unavailable machine"
                assert status.xCanAcceptService, "Command to a machine that cannot accept service"
                operation = m.eMachineOperation
                self.service_jobs[index] = operation, 0
                status.xBusy, status.xCanAcceptService, status.xServiceRequired = True, False, False
                status.xPartReady = False
                self.operations["machine:" + self.enum_name("E_MACHINE_OPERATION", operation)] += 1
            elif index in self.processing:
                self.processing[index] -= 1
                status.tRemaining = 100 * max(0, self.processing[index])
                if self.processing[index] <= 0:
                    del self.processing[index]
                    status.xProcessing = False
                    status.ePartState, status.ePartType = enums["E_PART_STATE"].LOADED, enums["E_PART_TYPE"].DETAIL
                    status.xPartReady = status.xCanAcceptService = status.xServiceRequired = True
                    status.eRecommendedOperation = enums["E_MACHINE_OPERATION"].CHANGE

    def _magazine_scan(self):
        m = self.manager
        for index, magazine in enumerate(self.magazines, 1):
            command = self.g["GVL_MAGAZINE"].astAutoCommand[index]
            if m.uiActiveMagazine == index:
                self.g["GVL_MAGAZINE"].astAutoCommand[index] = m.Command.stMagazine
                command = self.g["GVL_MAGAZINE"].astAutoCommand[index]
            else:
                command.xExecute = command.xStop = False
            magazine.stMagazineCommand = command
            magazine.xRobotOwnsMagazine = m.uiActiveMagazine == index and (m.xRunning or self.robot.xBusy)
            magazine.xRobotCanWorkWithMagazine = not m.axMagazineExchangeInProgress[index] and not self.robot.xError
            magazine.xGlobalError, magazine.xIoManual = m.xGlobalError, m.xIoManual
            if self.mode:
                twin_status = self.twin.astStatus[index]
                magazine.xHmiEnable = twin_status.xReady and not m.axMagazineExchangeInProgress[index] and not magazine.Status.xEnabled and not magazine.Status.xFinished
                magazine.xHmiDisable = not twin_status.xEnabled or twin_status.xBusy or m.axMagazineExchangeInProgress[index]
            magazine()
            magazine.xInventoryChanged = False
            self.public_magazines[index] = magazine.Status
            if self.mode:
                public = self.public_magazines[index]; twin = self.twin.astStatus[index]
                public.xReady = public.xReady and twin.xReady
                public.xEnabled = twin.xEnabled
                public.xBusy = public.xBusy or twin.xBusy

    def _robot_scan(self):
        r, m, actions = self.robot, self.manager, self.registry.enums["E_ROBOT_ACTION"]
        requests = [("cell", m.Command.stRobot)] + [(f"magazine:{i}", b.Command) for i, b in enumerate(self.magazines, 1)]
        requests = [(owner, command) for owner, command in requests if command.xExecute]
        assert len(requests) <= 1, f"Concurrent robot commands: {[p[0] for p in requests]}"
        if not requests:
            if self.robot_job and r.xBusy:
                raise AssertionError("Robot command withdrawn before completion")
            self.robot_job = None; r.xDone = r.xBusy = False
            return
        owner, command = requests[0]
        if not self.robot_job:
            assert not r.xBusy and not r.xDone
            self.robot_job = owner, copy.deepcopy(command)
            r.xBusy = True
            self.operations["robot:" + self.enum_name("E_ROBOT_ACTION", command.eAction)] += 1
        elif not r.xDone:
            previous_owner, active = self.robot_job
            assert owner == previous_owner, "Robot owner changed during movement"
            if active.eAction == actions.MOVE_TO_POINT:
                r.eCurrentPoint = active.eSetPoint
                r.uiMagazineContext = active.uiMagazineId
            elif active.eAction == actions.ROTATE_TO_BLANK:
                r.xRotatedToBlank, r.xRotatedToDetail = True, False
            elif active.eAction == actions.ROTATE_TO_DETAIL:
                r.xRotatedToBlank, r.xRotatedToDetail = False, True
            elif active.eAction == actions.CLAMP_1:
                assert not r.xBlankAvailable, "Overwriting gripper 1"
                self.hold(m.Command.uiBlankPayloadType, r.uiDetailPayloadType)
            elif active.eAction == actions.UNCLAMP_1:
                self.hold(0, r.uiDetailPayloadType)
            elif active.eAction == actions.UNCLAMP_2:
                self.hold(r.uiBlankPayloadType, 0)
            else:
                raise AssertionError(f"Unmodelled robot action {active.eAction}")
            r.xBusy, r.xDone = False, True

    def scan(self, dt=100):
        self.clock.now += dt; self.scans += 1
        self._twins()
        self._geometry_scan()
        self.manager()
        self.states.add(self.enum_name("E_CELL_MANAGER_STATE", self.manager.eState))
        self._machine_scan()
        self._magazine_scan()
        self._robot_scan()
        self.trace.append(self.snapshot())

    def run(self, scans=500):
        for _ in range(scans):
            self.scan()
        return self

    def enum_name(self, enum, value):
        return next((name for name, candidate in vars(self.registry.enums[enum]).items() if candidate == value), str(value))

    def inventory(self):
        result = Counter(self.removed)
        for index, magazine in enumerate(self.magazines, 1):
            inventories = self.twin.astStore[index].astPallet.values if self.mode else [magazine.stInventory]
            for inventory in inventories:
                for slot in inventory.aSlots.values[:self.slots]:
                    if slot.xInPosition:
                        result[slot.uiProductType] += 1
        for index in range(1, 4):
            status = self.manager.astMachineStatus[index]
            if status.ePartState == self.registry.enums["E_PART_STATE"].LOADED:
                result[self.manager.Config.auiMachineType[index]] += 1
        if self.robot.xBlankAvailable:
            result[self.robot.uiBlankPayloadType] += 1
        if self.robot.xDetailAvailable:
            result[self.robot.uiDetailPayloadType] += 1
        for station in getattr(self, "stations", []):
            if station.Memory.xOccupied:
                result[station.Memory.Part.uiProductType] += 1
        return result

    def snapshot(self):
        m = self.manager
        return {"scan": self.scans, "state": self.enum_name("E_CELL_MANAGER_STATE", m.eState),
            "active": m.uiActiveMagazine, "source": m.uiSupplyMagazine, "return": m.uiReturnMagazine,
            "machine": m.uiSelectedMachine, "blank": self.robot.uiBlankPayloadType, "detail": self.robot.uiDetailPayloadType,
            "magazine_operation": self.enum_name("E_MAGAZINE_OPERATION", m.eMagazineOperation),
            "magazines": [self.enum_name("E_MAGAZINE_STATE", b.Diag.eState) for b in self.magazines],
            "calls": [[c.udiId, c.uiState, c.uiStation] for c in self.geometry.astCalls.values],
            "error": m.Error.dwErrorActive}
