"""Offline recovery harness using production ST owners in PLC scan order.

Machine, robot, motion/point, gripper, magazine, GK, safety and twin-pallet
decision blocks execute their actual ST. SoftMotion drives are an explicit
bounded environment; no controller, network, force/override or database API.
"""
from __future__ import annotations

from .cell import Cell, Machine, global_record, record
from .st_runtime import Block, Program, Registry, RisingEdge, StArray


def recovery_registry():
    registry = Registry()
    # Opaque vendor type, never dereferenced by the executed decision sources.
    # Any attempted access raises an undeclared-field error.
    registry.sources["SMC_POS_REF"] = "STRUCT END_STRUCT"
    return registry


class TwinPlant:
    """Actual twin logic and cylinder simulation; abstract axis feedback only."""

    def __init__(self, registry, globals, role=1):
        self.registry, self.globals, self.axis_job = registry, globals, None
        self.freeze_axis = self.freeze_cylinders = self.drive_fault = False
        self.sensor_overrides = {}
        self.block = Block(registry, "FB/FB_TWO_PALLET.st", globals)
        self.cylinders = Block(registry, "FB/FB_TWO_PALLET_SIMULATION.st", globals)
        b = self.block
        b.xSelected = b.xManual = b.xSafe = b.xConnection = True
        b.xPointsConfigured = b.xRobotGeometryReady = b.xRobotMagazineReady = True
        b.xRobotSwapWindow = True
        c = b.Config
        c.xConfigured = c.xSignalPatternsConfigured = True
        c.uiP1Signals, c.uiP2Signals = 37, 26
        c.lrExchange, c.lrWorkP1, c.lrWorkP2, c.lrHome = 0, 1000, 1200, 0
        c.lrTolerance, c.lrVelocity = 2, 100
        c.lrAcceleration, c.lrDeceleration, c.lrJerk = 100, 100, 1000
        c.tPulse, c.tCylinder, c.tMove, c.tHome = 100, 1500, 3000, 3000
        i = b.Input
        i.xIoMapped = i.xAxisBound = i.xPowered = i.xHomed = i.xStandstill = True
        self.cylinders(xEnable=True, uiP1Signals=c.uiP1Signals)
        if role == 2:
            self.cylinders.xLiftTargetUp = True
            self.cylinders.xLockTargetOut = True
            self.cylinders.xStopTargetOut = False
            self.cylinders.xLiftDown, self.cylinders.xLiftUp = False, True
            self.cylinders.xLockIn, self.cylinders.xLockOut = False, True
            self.cylinders.xStopIn, self.cylinders.xStopOut = True, False
        self._cylinder_feedback()
        i.lrPosition = c.lrWorkP1 if role == 1 else c.lrWorkP2
        b()
        b.Command.uiPallet, b.Command.udiRevision = b.Status.uiCandidate, b.Status.udiRevision
        b.Command.xConfirm = True; b(); b.Command.xConfirm = False
        b.Command.xEnable = True; b(); b.Command.xEnable = False
        b()
        assert b.Status.xConfirmed and b.Status.xEnabled and b.Status.uiRobotPallet == role

    def _cylinder_feedback(self):
        for name in ("xLiftDown", "xLiftUp", "xLockIn", "xLockOut", "xStopIn", "xStopOut"):
            setattr(self.block.Input, name, getattr(self.cylinders, name))

    def step(self):
        b, i = self.block, self.block.Input
        if not self.freeze_cylinders:
            self.cylinders(xEnable=True, uiP1Signals=b.Config.uiP1Signals, Command=b.Output)
        self._cylinder_feedback()
        for name, value in self.sensor_overrides.items():
            setattr(i, name, value)
        if self.drive_fault:
            i.xDriveError = True
        elif b.Output.xDriveReset:
            i.xDriveError = False
        if b.Output.xStop:
            self.axis_job = None; i.xStandstill = True; i.xMotionDone = False
        elif self.axis_job and not self.freeze_axis:
            kind, target, remaining = self.axis_job
            if remaining <= 1:
                i.xStandstill, i.xMotionDone = True, True
                i.lrPosition = target
                if kind == "home":
                    i.xHomed = True
                self.axis_job = None
            else:
                self.axis_job = kind, target, remaining - 1
        elif (b.Output.xMove or b.Output.xHome) and self.axis_job is None:
            self.axis_job = ("home" if b.Output.xHome else "move", b.Config.lrHome if b.Output.xHome else b.Output.lrTarget, 2)
            i.xStandstill, i.xMotionDone = False, False
        else:
            i.xMotionDone = False
        b()

    def command(self, name, limit=40):
        if name == "xConfirm":
            self.block.Command.uiPallet = self.block.Status.uiCandidate
            self.block.Command.udiRevision = self.block.Status.udiRevision
        setattr(self.block.Command, name, True)
        self.registry.clock.now += 100; self.step()
        accepted = self.block.Status.xCommandAccepted
        setattr(self.block.Command, name, False)
        for _ in range(limit):
            self.registry.clock.now += 100; self.step()
            if not self.block.Status.xBusy:
                return accepted
        raise AssertionError(("Twin command remained Busy", name, self.block.Diag.eState, self.block.Error.dwErrorActive))

    def restore(self, *, enable=True):
        """Permitted manual sequence; physical failures must already be repaired."""
        b = self.block
        actions = []
        def run(name):
            accepted = self.command(name)
            actions.append((name, accepted))
            return accepted
        if b.Status.xEnabled:
            run("xDisable")
        if b.Input.xDriveError:
            run("xDriveReset")
        if not b.Input.xLiftDown or b.Input.xLiftUp:
            run("xLower")
        if b.Status.xHomeRequired or not b.Input.xHomed:
            run("xHome")
        if b.Error.dwErrorActive:
            run("xReset")
        if not b.xWork:
            run("xMoveToWork")
        if b.uiSelected == 2 and not b.Input.xLiftUp:
            run("xRaise")
        if enable and not b.Status.xConfirmed:
            run("xConfirm")
        if enable and not b.Status.xEnabled:
            run("xEnable")
        return {"ready": b.Status.xReady, "actions": actions, "error": b.Error.dwErrorActive,
                "home_required": b.Status.xHomeRequired, "candidate": b.Status.uiCandidate}


class RecoveryCell(Cell):
    def __init__(self, *, mode=0, roles=(1, 1), machines=None, magazines=None, geometry=(True, True), start=True):
        super().__init__(types=1, mode=mode, roles=roles, slots=4,
                         machines=machines or [Machine("empty") for _ in range(3)],
                         magazines=magazines or [[1, 1, 0, 0], [1, 1, 0, 0]],
                         geometry=geometry, registry=recovery_registry(), autostart=False)
        r, m = self.registry, self.manager
        self.global_fault, self.group_fault, self.group_job, self.group_reset_job = False, False, None, 0
        self.axis_reset_job = 0
        self.group_reset_delay = 2
        self.manual, self.reset, self.stop = False, False, False
        self.g["GVL_POINT"] = global_record(r, "GVL/GVL_POINT.gvl.st", self.g, {"iPointNumber", "iPersistentPointCapacity"})
        self.settings = global_record(r, "GVL/GVL_CELL_SETTINGS.gvl.st", self.g,
            {"stMachineTimeouts", "CHANGE_MACHINE", "LOAD_MACHINE", "UNLOAD_MACHINE", "stAxisGroupTimeouts"})
        self.robot_block = Block(r, "FB/FB_ROBOT.st", {**m.state, **self.g})
        self.group = self.robot_block.GroupData
        self.group.Diag.iStep = r.enums["E_AXIS_GROUP_STATE"].READY
        self.group.Timeouts = self.settings.stAxisGroupTimeouts
        self.group.Status.xPositionValid = True
        self.robot_block.xDrivesPowered = self.robot_block.xDrivesReady = True
        self.robot_block.rPointCheckSpeedPercent = 10
        self.robot_block.tGripper1OpenTime = self.robot_block.tGripper1CloseTime = 100
        self.robot_block.tGripper2OpenTime = self.robot_block.tGripper2CloseTime = 100
        self.robot_block.tGripperChangeTime = 100
        self.robot_block.tSoftMotionResetTimeout = 3000
        for point in self.robot_block.stPoint.values:
            point.xConfigured, point.SpeedFactor = True, 0.2
        for index, point in enumerate(self.robot_block.stPoint.values):
            point.X = index * 50.0
        home = r.enums["E_POINT_NAME"].HOME_SAFETY
        m.stSafetyHomePoint = self.robot_block.stPoint[home]
        self.group.Status.ActualX = m.stSafetyHomePoint.X
        diag = self.robot_block.stPointManager.Diag
        for axis in ("X", "Y", "Z"):
            setattr(diag, f"x{axis}LimitValid", True)
            setattr(diag, f"lr{axis}_MinLimit", -10000)
            setattr(diag, f"lr{axis}_MaxLimit", 10000)
        self.robot_block()
        self.robot_block.stMotionManager.Status.eCurrentPoint = r.enums["E_POINT_NAME"].HOME_SAFETY
        self.robot_block()
        self.robot = self.robot_block.Status
        self._publish_robot()
        self.machine_blocks, self.machine_sim, self.machine_faults = [], [], []
        state_map = {"disabled": 0, "empty": 1, "processing": 2, "done": 3}
        for index, spec in enumerate(self.machine_specs, 1):
            b = Block(r, "FB/FB_MACHINE.st", m.state)
            sim = Block(r, "FB/FB_MACHINE_SIMULATION.st", m.state)
            b.xPointsConfigured = b.xAutomaticUseEnabled = True
            b.stTimeouts = self.settings.stMachineTimeouts
            b.stLoadRecipe, b.stChangeRecipe, b.stUnloadRecipe = self.settings.LOAD_MACHINE, self.settings.CHANGE_MACHINE, self.settings.UNLOAD_MACHINE
            b.stPoints.eAbove = getattr(r.enums["E_POINT_NAME"], f"MACHINE_{index}_ABOVE")
            b.stPoints.eInside = getattr(r.enums["E_POINT_NAME"], f"MACHINE_{index}_INSIDE")
            b.stPoints.eChuck = getattr(r.enums["E_POINT_NAME"], f"MACHINE_{index}_CHUCK_POSITION")
            b.stPoints.eChuckApproach = getattr(r.enums["E_POINT_NAME"], f"MACHINE_{index}_CHUCK_APROACH")
            sim.tDoorOpenTime = sim.tDoorCloseTime = sim.tChuckOpenTime = sim.tChuckCloseTime = 100
            sim.tCycleTime = max(1000, spec.remaining * 100)
            sim(xTestInitialize=True, uiTestInitialState=state_map[spec.mode]); sim.xTestInitialize = False
            b.stRobotStatus = self.robot
            b(xTestInitialize=True, uiTestInitialState=state_map[spec.mode], stMachineStatus=sim.Status)
            b.xTestInitialize = False
            self.machine_blocks.append(b); self.machine_sim.append(sim)
            self.machine_faults.append(Block(r, "FB/FB_FAULT_INJECTOR/FB_MACHINE_FAULT_INJECTOR.st", m.state))
            m.astMachineStatus[index] = b.Status
        self.processing.clear()
        self.g["GVL_MACHINE"].Status = m.astMachineStatus
        for magazine in self.magazines:
            magazine.state["stRobotStatus"] = self.robot
        self.axes = StArray(1, [record(Diag=record(iStep=0), Command=record(xResetAllError=False)) for _ in range(3)], "RECORD")
        self.reset_env = {**r.enums, "_types": {}, "GVL_HMI": record(xModbusMode=False),
            "GVL_CELL_CONTROL": record(xReset=False), "GVL_AXIS": record(arrAxis=self.axes),
            "GVL_AXIS_GROUP": record(AxisGroup=self.group), "xHmiResetAccepted": False,
            "rtMotionReset": RisingEdge(), "eMotionResetState": r.enums["E_MOTION_RESET_STATE"].IDLE}
        source = (r.root / "PLC_PRG.RunMotion.st").read_text(encoding="utf-8-sig")
        snippet_start = source.index("xMotionResetRequest :=")
        end = source.index("GVL_AXIS_GROUP.AxisGroup.Command.xReset :=", snippet_start)
        end = source.index(";", end) + 1
        self.reset_program = Program(source[snippet_start:end], "RunMotion:reset orchestration")
        self.twins = [TwinPlant(r, self.g, role) for role in roles] if mode else []
        self.twin._types["astStatic"] = "ARRAY [1..2] OF ST_MAGAZINE_INVENTORY"
        self.twin.astStatic = StArray(1, [b.stInventory for b in self.magazines], "ST_MAGAZINE_INVENTORY")
        self.twin._types["astError"] = "ARRAY [1..2] OF ST_TWO_PALLET_ERRORS"
        self.twin.astError = StArray(1, [p.block.Error for p in self.twins] if mode else
                                     [r.value("ST_TWO_PALLET_ERRORS", self.g) for _ in range(2)], "ST_TWO_PALLET_ERRORS")
        self.twin_stop_latched = StArray(1, [False, False], "BOOL")
        # Execute the actual common-Reset -> twin command adapter as well as the
        # owner. A global Reset is not an implicit direct clear of twin errors.
        source = (r.root / "PLC_PRG.RunTwoPallet.st").read_text(encoding="utf-8-sig")
        start_at = source.index("IF GVL_HMI.astMagazineCommand[uiTwin].xReset")
        end_at = source.index("END_IF;", start_at) + len("END_IF;")
        reset_at = source.index("astTwinCommand[uiTwin].xReset :=")
        reset_end = source.index(";", reset_at) + 1
        self.twin_reset_program = Program(source[start_at:end_at] + "\n" + source[reset_at:reset_end],
                                          "RunTwoPallet: common Reset adapter")
        self.twin_reset_env = {**r.enums, "_types": {}, "uiTwin": 1,
            "GVL_HMI": record(astMagazineCommand=StArray(1, [record(xReset=False) for _ in range(2)], "RECORD")),
            "GVL_CELL_CONTROL": record(xReset=False),
            "GVL_TWO_PALLET": record(auiCommand=StArray(1, [0, 0], "UINT"), astStatus=self.twin.astStatus),
            "astTwinCommand": StArray(1, [p.block.Command for p in self.twins], "ST_TWO_PALLET_COMMAND")}
        mg = self.g["GVL_MAGAZINE"]
        mg._types.update(astStatus="ARRAY [1..2] OF ST_MAGAZINE_STATUS", astError="ARRAY [1..2] OF ST_MAGAZINE_ERRORS")
        mg.__dict__["astStatus"] = self.public_magazines
        mg.astError = StArray(1, [b.Error for b in self.magazines], "ST_MAGAZINE_ERRORS")
        self.g["GVL_DETAIL"] = record(astMagazine=StArray(1, [b.stInventory for b in self.magazines], "ST_MAGAZINE_INVENTORY"))
        source = (r.root / "PLC_PRG.RunMagazine.st").read_text(encoding="utf-8-sig")
        snippet_start = source.index("FOR uiTwin := 1 TO 2 DO", source.index("// Сохранить физический инвентарь"))
        snippet_end = source.index("END_FOR;", snippet_start) + len("END_FOR;")
        self.magazine_publish_program = Program(source[snippet_start:snippet_end], "RunMagazine:publish and twin cascade")
        self.reset_dependencies_program = r.program("PLC_PRG.BuildRobotResetDependencies.st")
        self.initial_inventory = self.inventory()
        if start:
            self.begin()

    def _publish_robot(self):
        self.manager.state["stRobotStatus"] = self.robot
        self.g["GVL_ROBOT"].Status = self.robot
        for b in getattr(self, "magazines", []):
            b.state["stRobotStatus"] = self.robot

    def begin(self):
        self.manager.xStart = True; self.scan(); self.manager.xStart = False; self.scan()

    def _motion_scan(self):
        self.reset_env["GVL_CELL_CONTROL"].xReset = self.reset
        self.reset_program.execute(self.reset_env)
        if self.group.Command.xReset:
            self.group_reset_job = self.group_reset_delay
            self.group.Diag.iStep = self.registry.enums["E_AXIS_GROUP_STATE"].RESETTING
        if self.group_reset_job:
            self.group_reset_job -= 1
            if not self.group_reset_job:
                if self.group_fault:
                    self.group.Diag.iStep = self.registry.enums["E_AXIS_GROUP_STATE"].ERROR
                else:
                    self.group.Diag.iStep = self.registry.enums["E_AXIS_GROUP_STATE"].READY
                    self.group.Status.xLocalError = self.group.Status.xLogicalError = self.group.Status.xGroupError = False
        if self.group_fault:
            self.group.Status.xLocalError = self.group.Status.xGroupError = True
            self.group.Diag.iStep = self.registry.enums["E_AXIS_GROUP_STATE"].ERROR
            self.group_job = None
        if any(axis.Command.xResetAllError for axis in self.axes.values):
            self.axis_reset_job = 2
        for axis in self.axes.values:
            axis.Diag.iStep = self.registry.enums["E_AXIS_STATE"].RESET_AXIS_ERROR if self.axis_reset_job else self.registry.enums["E_AXIS_STATE"].READY
        self.axis_reset_job = max(0, self.axis_reset_job - 1)
        motion = self.robot_block.stMotionManager
        if self.robot_block.Command.xStop or motion.Command.xStop or self.global_fault:
            self.group_job = None
            self.group.Status.xMoveDirectDone = False
        elif self.group_job:
            self.group_job -= 1
            if not self.group_job:
                self.group.Status.xMoveDirectDone = True
                self.group.Status.ActualX = self.group.MotionParam.lrX
                self.group.Status.ActualY = self.group.MotionParam.lrY
                self.group.Status.ActualZ = self.group.MotionParam.lrZ
        elif self.group.Command.xMoveDirect and not self.group_fault:
            self.group_job = 2
        else:
            self.group.Status.xMoveDirectDone = False

    def _twins(self):
        if not self.mode:
            return
        m = self.manager
        for index, plant in enumerate(self.twins, 1):
            b, magazine = plant.block, self.magazines[index - 1]
            self.adapter.update({"uiTwin": index, "xTwinAutoSwapEnabled": self.swaps[index - 1], "CELL_MANAGER": m})
            self.swap_request.execute(self.adapter)
            b.xManual, b.xSafe = self.manual and not m.xRunning, not self.global_fault
            b.xRobotOperation = self.adapter["xTwinRobotOperation"]
            b.xRobotSwapWindow = self.adapter["xTwinRobotSwapWindow"]
            b.xAutoSwap = m.axMagazineAutoSwapPending[index] and self.swaps[index - 1]
            b.xOtherLoaded = self.adapter["xTwinOtherLoaded"]
            b.xStopRequest = self.stop
            b.xRobotMagazineReady = magazine.Status.xEnableCheckNoError and magazine.Status.xEnableCheckGeometry
            self.twin_reset_env["uiTwin"] = index
            self.twin_reset_env["GVL_CELL_CONTROL"].xReset = self.reset
            self.twin_reset_env["GVL_TWO_PALLET"].auiCommand[index] = 0
            self.twin_reset_program.execute(self.twin_reset_env)
            previous = b.Status.uiRobotPallet
            plant.step()
            self.twin.astStatus[index] = b.Status
            self.twin.astError[index] = b.Error
            m.axMagazineExchangeInProgress[index] = b.Status.xBusy or b.Status.xCompleted
            if b.Status.uiRobotPallet in (1, 2) and b.Status.uiRobotPallet != previous:
                magazine.state["stInventory"] = self.twin.astStore[index].astPallet[b.Status.uiRobotPallet]
                magazine.xInventoryChanged = True
            magazine.xMechanismReady = b.Status.xReady
            public = self.public_magazines[index]
            public.xReady = magazine.Status.xReady and b.Status.xReady
            public.xEnabled = b.Status.xEnabled
            public.xBusy = magazine.Status.xBusy or b.Status.xBusy
        m.xMagazineExchangeActive = any(m.axMagazineExchangeInProgress.values)

    def _machine_scan(self):
        m = self.manager
        for index, (b, simulation) in enumerate(zip(self.machine_blocks, self.machine_sim), 1):
            simulation(Command=b.Command.stIo)
            injector = self.machine_faults[index - 1]
            injector(xUsePhysicalInput=False, Request=simulation.FaultRequest, MachineStatusRaw=simulation.Status,
                     RobotStatusRaw=self.robot, NominalTimeouts=self.settings.stMachineTimeouts)
            b.stMachineStatus, b.stRobotStatus, b.stTimeouts = injector.MachineStatus, injector.RobotStatus, injector.Timeouts
            b.xManualMode, b.xGlobalError, b.xIoManual = self.manual, self.global_fault, m.xIoManual
            b.xRobotMotionBusy = bool(self.group_job)
            b.eRobotTargetPoint = self.robot_block.eActivePoint
            b.xResetGlobal = self.reset
            b.xResetCancel = self.stop or self.robot_block.stHmiCommand.xStop
            b.RobotResetRecovery = self.robot_block.ResetRecovery
            b.xExecute = m.Command.axMachineExecute[index]
            b()
            m.astMachineStatus[index] = b.Status
            m.astMachineDiag[index] = b.Diag

    def _robot_scan(self):
        b, m = self.robot_block, self.manager
        b.stCellCommand = m.Command.stRobot
        for index, machine in enumerate(self.machine_blocks, 1):
            setattr(b, f"stMachine_{index}_Command", machine.Command.stRobot)
        commands = self.g["GVL_MAGAZINE"].astCommand.values
        selected = next((command for command in commands if command.xExecute or command.xStop), None)
        b.stMagazineCommand = selected if selected is not None else self.registry.value("ST_ROBOT_COMMAND", self.g)
        b.uiBlankPayloadType, b.uiDetailPayloadType = m.Command.uiBlankPayloadType, m.Command.uiDetailPayloadType
        b.axMagazineExchangeInProgress = m.axMagazineExchangeInProgress
        b.xReset = self.reset
        b.xResetCancel = self.stop
        b.xManual = self.manual and not m.xRunning
        b.xHmiPermit = self.manual and not m.xRunning
        b.xGlobalError = self.global_fault
        b.xManualRecoveryAllowed = self.global_fault and self.manual and not m.xRunning
        b.xMotionBusy = bool(self.group_job)
        b.xDriveError = self.group.Status.xLocalError
        b.xMotionResetBusy = self.reset_env["xMotionResetBusy"]
        b.xEquipmentStopRequired = (any(machine.Status.xCriticalError for machine in self.machine_blocks)
            or any(s.xRobotStopRequired for s in m.astMagazineStatus.values)
            or any(s.xRobotStopRequired for s in self.geometry.astStatus.values))
        dependencies = self.registry.value("ST_ROBOT_RESET_DEPENDENCIES", self.g)
        environment = {**self.g, "_types": {}, "GVL_MACHINE": record(Status=m.astMachineStatus),
            "stRobotResetDependencies": dependencies, "axTwinRobotStopLatched": self.twin_stop_latched,
            "GEOMETRY": StArray(1, self.stations, "FB_GEOMETRY_CONTROL"),
            "TWIN": StArray(1, [p.block for p in self.twins] if self.twins else
                [record(Input=self.registry.value("ST_TWO_PALLET_INPUT", self.g)) for _ in range(2)], "FB_TWO_PALLET")}
        self.reset_dependencies_program.execute(environment)
        b.ResetDependencies = dependencies
        b()
        self.robot = b.Status
        self._publish_robot()

    def _magazine_scan(self):
        for magazine in self.magazines:
            magazine.xReset = self.reset
            magazine.xResetCancel = self.stop or self.robot_block.stHmiCommand.xStop
            magazine.xManual = self.manual and not self.manager.xRunning
            magazine.RobotResetRecovery = self.robot_block.ResetRecovery
        super()._magazine_scan()
        mg = self.g["GVL_MAGAZINE"]
        for index, magazine in enumerate(self.magazines, 1):
            mg.astPartStatus[index] = magazine.Status
            mg.astCommand[index] = magazine.Command
            mg.astError[index] = magazine.Error
            self.g["GVL_DETAIL"].astMagazine[index] = magazine.stInventory
        environment = {**self.g, "_types": {}, "axTwinRobotStopLatched": self.twin_stop_latched}
        self.magazine_publish_program.execute(environment)
        if self.mode:
            for index, magazine in enumerate(self.magazines, 1):
                role = self.twin.astStatus[index].uiRobotPallet
                if role in (1, 2):
                    magazine.state["stInventory"] = self.twin.astStore[index].astPallet[role]

    def scan(self, dt=100):
        self.clock.now += dt; self.scans += 1
        m = self.manager
        m.xGlobalError, m.xManual, m.xReset, m.xResetRequest, m.xStop = self.global_fault, self.manual, self.reset, self.reset, self.stop
        for station in self.stations:
            station.xReset = self.reset
        self._motion_scan()
        self._twins()
        self._geometry_scan()
        m.xMotionBusy = bool(self.group_job)
        m.xDrivesReady = not self.group.Status.xLocalError
        m.lrRobotActualX, m.lrRobotActualY, m.lrRobotActualZ = self.group.Status.ActualX, self.group.Status.ActualY, self.group.Status.ActualZ
        self.g["GVL_CELL_CONTROL"].xManual, self.g["GVL_CELL_CONTROL"].xStop = self.manual, self.stop
        m()
        self._machine_scan()
        self._magazine_scan()
        self._robot_scan()
        self.trace.append(self.snapshot())

    def pulse_reset(self):
        self.reset = True; self.scan(); self.reset = False
        for _ in range(15):
            self.scan()

    def move_home(self, limit=80):
        b = self.robot_block
        b.stHmiCommand.xExecute = True
        b.stHmiCommand.eAction = self.registry.enums["E_ROBOT_ACTION"].MOVE_TO_POINT
        b.stHmiCommand.eSetPoint = self.registry.enums["E_POINT_NAME"].HOME_SAFETY
        for _ in range(limit):
            self.scan()
            if self.robot.xDone:
                break
        else:
            return False
        b.stHmiCommand.xExecute = False
        for _ in range(4):
            self.scan()
        return self.robot.eCurrentPoint == self.registry.enums["E_POINT_NAME"].HOME_SAFETY and not self.robot.xError

    def restart(self, limit=400):
        """New operator Start and truthful answers for the single product type."""
        m = self.manager
        if not m.Status.xStartAllowed:
            return False
        self.begin()
        for _ in range(limit):
            state = self.enum_name("E_CELL_MANAGER_STATE", m.eState)
            answer = {"WAIT_GRIPPER1_CONTENT": 1, "WAIT_GRIPPER2_CONTENT": 2,
                      "WAIT_GRIPPER1_TYPE": 1, "WAIT_GRIPPER2_TYPE": 1}.get(state)
            if state == "WAIT_START_MACHINE":
                answer = next((i for i in (1, 2, 3) if m.uiOperatorMachineMask & (1 << (i - 1))), None)
            if answer is not None:
                m.uiOperatorChoice, m.xOperatorChoice = answer, True
                self.scan(); m.xOperatorChoice = False; self.scan()
            else:
                self.scan()
            if any(self.errors().values()):
                return False
            if m.xRunning and (self.robot.xBusy or any(b.Status.xBusy for b in self.machine_blocks)):
                return True
        return False

    def errors(self):
        return {"cell": self.manager.Error.dwErrorActive, "robot": self.robot_block.Error.dwErrorActive,
            "motion": self.robot_block.stMotionManager.Error.dwErrorActive, "gripper": self.robot_block.fbGripper.Error.dwErrorActive,
            **{f"machine{i}": b.Error.dwErrorActive for i, b in enumerate(self.machine_blocks, 1)},
            **{f"magazine{i}": b.Error.dwErrorActive for i, b in enumerate(self.magazines, 1)},
            **{f"geometry{i}": b.Memory.dwAlarm for i, b in enumerate(self.stations, 1)},
            **{f"twin{i}": p.block.Error.dwErrorActive for i, p in enumerate(self.twins, 1)}}

    def restore_machine(self, index, content=None, limit=40):
        b = self.machine_blocks[index - 1]
        b.xHmiEnable = True; self.scan(); b.xHmiEnable = False
        for _ in range(limit):
            name = self.enum_name("E_MACHINE_STATE", b.eState)
            if name == "IDLE":
                return True
            if name == "OPERATOR_CHOICE_PART":
                if content is None:
                    content = "detail" if b.stMachineStatus.xCycleDone else "blank"
                b.xHmiSetDetail, b.xHmiSetBlank = content == "detail", content == "blank"
            elif name == "OPERATOR_CHOICE_DOOR":
                b.xHmiAcceptDoor = True
            elif name == "OPERATOR_CHOICE_RUN":
                b.xHmiAcceptRunCNC = True
            self.scan()
            b.xHmiSetDetail = b.xHmiSetBlank = b.xHmiAcceptDoor = b.xHmiAcceptRunCNC = False
        return False

    def ready_for_start(self, *, max_resets=3, reenable=True):
        """Explicit operator recovery actions; no hidden write to error masks."""
        self.manual = True; self.stop = False
        self.robot_block.stHmiCommand.xExecute = False
        for _ in range(400):
            self.scan()
            if not self.manager.xRunning:
                break
        for _ in range(8):
            self.scan()
        self.recovery_cargo = self.robot.xBlankAvailable, self.robot.xDetailAvailable
        self.recovery_stock = [[(s.xInPosition, s.eDetailType, s.uiProductType) for s in b.stInventory.aSlots.values]
                               for b in self.magazines]
        for twin in self.twins:
            if twin.block.Error.dwErrorActive:
                twin.restore(enable=False)
        self.scan()
        resets = 0
        while any(value for name, value in self.errors().items() if not name.startswith("twin")) and resets < max_resets:
            # Open a closed robot hatch with the owner's permitted recovery command.
            for b in self.machine_blocks:
                b.xHmiOpenHatch = b.xManualHatchRecoveryOpenAllowed
            for _ in range(5):
                self.scan()
            for b in self.machine_blocks:
                b.xHmiOpenHatch = False
            self.pulse_reset(); resets += 1
        if any(value for name, value in self.errors().items() if not name.startswith("twin")):
            return {"ready": False, "stage": "reset", "resets": resets, "errors": self.errors(), "snapshot": self.snapshot()}
        if not self.move_home():
            return {"ready": False, "stage": "home", "resets": resets, "errors": self.errors(), "snapshot": self.snapshot()}
        if reenable:
            for twin in self.twins:
                if not twin.restore()["ready"]:
                    return {"ready": False, "stage": "twin", "resets": resets, "errors": self.errors(), "snapshot": self.snapshot()}
            self.scan()
            for index in range(1, 4):
                self.restore_machine(index)
            for magazine in self.magazines:
                magazine.xHmiEnable = True
            self.scan()
            for magazine in self.magazines:
                magazine.xHmiEnable = False
            self.scan()
        self.manual = False
        for _ in range(3):
            self.scan()
        return {"ready": self.manager.Status.xStartAllowed, "stage": "start", "resets": resets,
                "errors": self.errors(), "snapshot": self.snapshot()}

    def snapshot(self):
        snap = super().snapshot()
        if not hasattr(self, "robot_block"):
            return snap
        b = self.robot_block
        snap.update(robot_state=self.enum_name("E_ROBOT_STATE", b.eState), robot_error=b.Error.dwErrorActive,
            robot_reset_allowed=b.Status.xResetAllowed, motion_state=self.enum_name("E_MOTION_MANAGER_STATE", b.stMotionManager.Diag.eState),
            motion_error=b.stMotionManager.Error.dwErrorActive, gripper_error=b.fbGripper.Error.dwErrorActive,
            machines_state=[self.enum_name("E_MACHINE_STATE", machine.eState) for machine in self.machine_blocks],
            machines_error=[machine.Error.dwErrorActive for machine in self.machine_blocks],
            magazines_error=[mag.Error.dwErrorActive for mag in self.magazines],
            start_allowed=self.manager.Status.xStartAllowed, manual=self.manual,
            home_required=self.manager.xSafetyHomeRequired,
            clock_ms=self.clock.now, group_error=self.group.Status.xLocalError,
            soft_reset_pending=b.xSoftMotionResetPending,
            robot_execute=b.Command.xExecute, robot_stop=b.Command.xStop,
            geometry_error=[station.Memory.dwAlarm for station in self.stations],
            geometry_reset_busy=[station.Status.xResetBusy for station in self.stations])
        return snap
