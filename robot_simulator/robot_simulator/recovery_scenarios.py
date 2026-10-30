"""Causal PLC Runtime recovery cases. Masks here select injectors, never errors."""
from __future__ import annotations

from .test_scenarios import scenario, _slots, BLANK, MACHINE_DETAIL_READY, MACHINE_EMPTY_READY


# command suffix, owner alarm bit, initial machine state, delayed activation state
MACHINE_RECOVERY_FAULTS = (
    ("machineAlarm", 14, MACHINE_EMPTY_READY, None),
    ("timeoutRobotMove", 15, MACHINE_EMPTY_READY, None),
    ("timeoutRobotAction", 16, MACHINE_EMPTY_READY, None),
    ("timeoutRobotRelease", 17, MACHINE_EMPTY_READY, "busy"),
    ("timeoutDoorOpen", 18, MACHINE_EMPTY_READY, None),
    ("timeoutDoorClose", 19, MACHINE_EMPTY_READY, None),
    ("timeoutChuckOpen", 20, MACHINE_DETAIL_READY, None),
    ("timeoutChuckClose", 21, MACHINE_EMPTY_READY, None),
    ("timeoutCycleStart", 22, MACHINE_EMPTY_READY, None),
    ("timeoutHatchUnlock", 24, MACHINE_EMPTY_READY, None),
)


def recovery_scenarios():
    """Fixed order shared by the runtime runner, catalog and coverage checks."""
    cases = []

    def add(name, activation, alarm, *, machines=None, automatic=False, permission=None):
        case = scenario(
            "Восстановление — " + name,
            description=("Причина → точная авария → устранение → один общий Reset → "
                         "ручной HOME → включение → новый Start → весь материал в готовых деталях. "
                         "После аварии начальное состояние повторно не загружается."),
            machines=machines or ((1, 1), (0, 1), (0, 1)),
            slots=_slots((1, BLANK, 1), (2, BLANK, 1)),
        )
        case["expectations"].update(testKind="fault-recovery", activation=activation,
                                    alarmSource=alarm[0], alarmCode=alarm[1],
                                    automaticFault=automatic)
        if permission:
            case["expectations"]["injectionPermission"] = permission
        cases.append(case)

    for machine in (1, 2, 3):
        for command, bit, initial, delayed_state in MACHINE_RECOVERY_FAULTS:
            machines = tuple((initial if i == machine else 0, 1) for i in (1, 2, 3))
            activation = {"command": "fault.machine." + command, "machine": machine}
            if delayed_state is not None:
                activation["machineBusy"] = True
            add(f"станок {machine}, {command}", activation, (machine + 1, bit),
                machines=machines, automatic=command != "machineAlarm")

    for command, bit in (("gripper1", 0), ("gripper2", 1),
                         ("gripperRotation", 2), ("gripperGlobal", 4)):
        add(command, {"command": "fault." + command}, (15, bit), automatic=True)
        if command == "gripperGlobal":
            cases[-1]["expectations"]["activation"]["afterStart"] = True
    for command, bit in (("pointXOutOfLimit", 0), ("pointYOutOfLimit", 1),
                         ("pointZOutOfLimit", 2), ("pointInvalidVelocity", 3)):
        add(command, {"command": "fault." + command}, (14, bit),
            permission="stPointFaultStatus.xAllowed")
    add("недопустимое действие робота", {"command": "fault.robotWrongAction"}, (1, 0),
        permission="stRobotFaultStatus.xAllowed")
    add("противоречивый груз ячейки", {"command": "fault.cellBothGrippers"}, (0, 0),
        permission="stCellFaultStatus.xAllowed")

    for magazine in (1, 2):
        for injection, bit, label in ((1, 0, "операция"), (2, 1, "нет заготовки"),
                                     (4, 2, "нет свободного слота"), (8, 3, "номер слота"),
                                     (16, 4, "содержимое слота"), (32, 7, "геометрия")):
            masks = {"cell": 0, "robot": 0, "machines": [0, 0, 0], "magazines": [0, 0]}
            masks["magazines"][magazine - 1] = injection
            add(f"магазин {magazine}, {label}", {"masks": masks}, (magazine + 4, bit))
            if magazine == 2:
                state = cases[-1]["initialState"]
                state["magazines"][0]["enabled"], state["magazines"][1]["enabled"] = False, True
                state["magazines"][0]["slots"], state["magazines"][1]["slots"] = (
                    state["magazines"][1]["slots"], state["magazines"][0]["slots"])

    safety = [("stationEmergencyStop", i, i - 1) for i in range(1, 5)]
    safety += [("cabinetEmergencyStop", i, i + 3) for i in (1, 2)]
    safety += [("emergencyStopMpg", None, 6), ("phaseRelay", None, 7),
               ("pressureRelay", None, 8), ("safetyRelay", None, 9)]
    safety += [("doorUnlocked", i, i + 9) for i in range(1, 5)]
    for command, index, bit in safety:
        activation = {"command": "fault.safety." + command}
        if index is not None:
            activation["index"] = index
        add(f"безопасность, {command}" + (f" {index}" if index else ""),
            activation, (16, bit), automatic=True)
        activation["afterStart"] = True
        # Door faults are conditional on the corresponding magazine being used.
        if command == "doorUnlocked" and index in (3, 4):
            magazines = cases[-1]["initialState"]["magazines"]
            magazines[0]["enabled"], magazines[1]["enabled"] = False, True
            magazines[0]["slots"], magazines[1]["slots"] = magazines[1]["slots"], magazines[0]["slots"]
    return cases
