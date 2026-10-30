"""Offline production RunMachines with real machine/simulation/injector owners.

No robot motion or physical input acquisition is emulated here. Stationary
robot feedback and explicit physical DI are the environment. HMI fault request
mapping and environment selection execute their current production ST.
"""
from __future__ import annotations

import re

from .cell import global_record, record
from .st_runtime import Block, Program, Registry, StArray


class MachineInputRig:
    def __init__(self, registry=None):
        self.registry = r = registry or Registry()
        r.clock.now = 0
        self.program = r.program("PLC_PRG.RunMachines.st")
        source = (r.root / "PLC_PRG.RunMachines.st").read_text(encoding="utf-8-sig")
        hmi_source = (r.root / "PLC_PRG.ReadHmiInputs.st").read_text(encoding="utf-8-sig")
        enable = re.search(r"GVL_CELL_SETTINGS\.xErrorSimulationEnabled\s*:=.*?;", hmi_source, re.S).group()
        start = hmi_source.index("\tastMachineFaultRequest[uiMachine].xEnabled :=")
        end = hmi_source.index("\n\tastAxisFaultRequest", start)
        requests = "FOR uiMachine := 1 TO 3 DO\n" + hmi_source[start:end] + "\nEND_FOR;"
        self.read_hmi = Program(enable + "\n" + requests, "ReadHmiInputs: machine fault requests")
        settings_names = set(re.findall(r"GVL_CELL_SETTINGS\.(\w+)", source + enable))
        hmi_names = set(re.findall(r"GVL_HMI\.(\w+)", source + enable + requests))
        self.settings = global_record(r, "GVL/GVL_CELL_SETTINGS.gvl.st", {}, settings_names)
        self.hmi = global_record(r, "GVL/GVL_HMI.gvl.st", {}, hmi_names - {"stTestScenario"})
        # Only the two declared machine fields of the scenario are consumed by
        # RunMachines. Fail closed on any new access to its other/2D fields.
        self.hmi._types["stTestScenario"] = "ST_TEST_SCENARIO_BUFFER"
        self.hmi.stTestScenario = record(auiMachineState=StArray(1, [1] * 3, "UINT"),
                                        auiMachineType=StArray(1, [1] * 3, "UINT"))
        self.owners = [Block(r, "FB/FB_MACHINE.st", {}) for _ in range(3)]
        self.simulations = [Block(r, "FB/FB_MACHINE_SIMULATION.st", {}) for _ in range(3)]
        self.injectors = [Block(r, "FB/FB_FAULT_INJECTOR/FB_MACHINE_FAULT_INJECTOR.st", {}) for _ in range(3)]
        self.control = record(xReset=False, xManual=False, xGlobalError=False, xStop=False, xDisable=False)
        self.robot = r.value("ST_ROBOT_STATUS", {})
        self.robot.eCurrentPoint = r.enums["E_POINT_NAME"].HOME_SAFETY
        self.machine = record(
            astPhysicalInput=StArray(1, [r.value("ST_MACHINE_IO_STATUS", {}) for _ in range(3)], "ST_MACHINE_IO_STATUS"),
            Status=StArray(1, [b.Status for b in self.owners], "ST_MACHINE_PUBLIC"),
            Command=StArray(1, [b.Command for b in self.owners], "ST_MACHINE_COMMAND"),
            Diag=StArray(1, [b.Diag for b in self.owners], "ST_MACHINE_DIAG"),
            Error=StArray(1, [b.Error for b in self.owners], "ST_MACHINE_ERRORS"))
        self.environment = {**r.enums, "_types": {}, "GVL_CELL_SETTINGS": self.settings, "GVL_HMI": self.hmi,
            "GVL_MACHINE": self.machine, "GVL_CELL_CONTROL": self.control,
            "ROBOT": record(ResetRecovery=r.value("ST_ROBOT_RESET_RECOVERY", {})),
            "GVL_ROBOT": record(Status=self.robot, Diag=r.value("ST_ROBOT_DIAG", {})),
            "GVL_CELL_MANAGER": record(Command=r.value("ST_CELL_COMMAND", {})),
            "xTestInitializePulse": False, "xTestAbortActive": False, "xIoManualActive": False, "xMotionBusy": False,
            "axMachinePointsReady": StArray(1, [True] * 3, "BOOL"),
            "astMachineStatusRaw": StArray(1, [r.value("ST_MACHINE_IO_STATUS", {}) for _ in range(3)], "ST_MACHINE_IO_STATUS"),
            "astMachineFaultRequest": StArray(1, [r.value("ST_MACHINE_FAULT_REQUEST", {}) for _ in range(3)], "ST_MACHINE_FAULT_REQUEST")}
        for i, (owner, simulation, injector) in enumerate(zip(self.owners, self.simulations, self.injectors), 1):
            self.environment.update({f"MACHINE_{i}": owner, f"MACHINE_{i}_SIM": simulation, f"MACHINE_{i}_FAULT": injector})
            simulation(xTestInitialize=True, uiTestInitialState=1)
            simulation.xTestInitialize = False
            self.machine.astPhysicalInput[i] = simulation.Status
            self.hmi.axMachineUsed[i] = True
            owner(xTestInitialize=True, uiTestInitialState=1, xPointsConfigured=True, xAutomaticUseEnabled=True,
                  stMachineStatus=simulation.Status, stRobotStatus=self.robot, stTimeouts=self.settings.stMachineTimeouts)
            owner.xTestInitialize = False

    def scan(self):
        self.registry.clock.now += 100
        self.read_hmi.execute(self.environment)
        self.program.execute(self.environment)

    def seed_alarm(self, index, active):
        """Boundary fixture: the simulator can retain its own old alarm latch."""
        self.machine.astPhysicalInput[index].xAlarm = active
        simulation = self.simulations[index - 1]
        simulation.Error.dwErrorActive = simulation.ERR_MACHINE_ALARM if active else 0
        simulation.Status.xAlarm = active

    def fault_mask(self, index, mask):
        for bit, name in enumerate(("axMachineSimAlarm", "axMachineSimDoorFault", "axMachineSimChuckFault")):
            getattr(self.hmi, name)[index] = bool(mask & (1 << bit))
