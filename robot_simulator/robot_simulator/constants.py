from __future__ import annotations

from enum import IntEnum, StrEnum


PROTOCOL_VERSION = 3
FAST_TIME_SCALE = 250.0
COMMAND_START_ADDRESS = 1000  # Document register 1001
COMMAND_REGISTER_COUNT = 9
STATUS_START_ADDRESS = 1100  # Document register 1101
STATUS_REGISTER_COUNT = 17


class RobotMode(StrEnum):
    STOPPED = "stopped"
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class ExecutionState(IntEnum):
    IDLE = 0
    ACCEPTED = 1
    BUSY = 2
    DONE = 3
    ERROR = 4
    STOPPED = 5


class ResultCode(IntEnum):
    OK = 0
    UNSUPPORTED_COMMAND = 1
    INVALID_POINT = 2
    INVALID_SLOT = 3
    NOT_READY = 4
    SAFETY_INTERLOCK = 5
    MOTION_ERROR = 6
    GRIPPER_ERROR = 7
    STOPPED = 8
    INTERNAL_ERROR = 255


class OperationPhase(IntEnum):
    IDLE = 0
    VALIDATING = 10
    ACCELERATING = 20
    MOVING = 30
    DECELERATING = 40
    GRIPPER = 50
    ROTATING = 60
    STOPPING = 90
    FAULT = 100


class CommandCode(IntEnum):
    NONE = 0
    RESERVED = 1
    GRIPPER_1_OPEN = 2
    GRIPPER_1_CLOSE = 3
    GRIPPER_2_OPEN = 4
    GRIPPER_2_CLOSE = 5
    ROTATE_TO_BLANK = 6
    ROTATE_TO_DETAIL = 7
    MACHINE_1_ABOVE = 10
    MACHINE_1_INSIDE = 11
    MACHINE_1_CHUCK_APPROACH = 12
    MACHINE_1_CHUCK_POSITION = 13
    MACHINE_2_ABOVE = 14
    MACHINE_2_INSIDE = 15
    MACHINE_2_CHUCK_APPROACH = 16
    MACHINE_2_CHUCK_POSITION = 17
    MACHINE_3_ABOVE = 18
    MACHINE_3_INSIDE = 19
    MACHINE_3_CHUCK_APPROACH = 20
    MACHINE_3_CHUCK_POSITION = 21
    HOME_SAFETY = 22
    MAGAZINE_SAFE = 23
    MAGAZINE_CHANGE = 24
    MAGAZINE_IN_SLOT = 25


POINT_NAMES: dict[int, str] = {
    int(code): code.name for code in CommandCode if 10 <= int(code) <= 25
}


class AlarmCode(IntEnum):
    NONE = 0
    EMERGENCY_STOP = 100
    MOTION_FAULT = 101
    GRIPPER_1_FAULT = 102
    GRIPPER_2_FAULT = 103
    SAFETY_INTERLOCK = 104
    HOMING_LOST = 105
    DRIVES_DISABLED = 106
    PLC_HEARTBEAT_LOST = 107
    EXTERNAL_STOP = 108
    MODE_CHANGE_DURING_COMMAND = 109


ALARM_TEXT: dict[int, str] = {
    AlarmCode.NONE: "Нет аварии",
    AlarmCode.EMERGENCY_STOP: "Нажат аварийный останов",
    AlarmCode.MOTION_FAULT: "Авария движения",
    AlarmCode.GRIPPER_1_FAULT: "Авария захвата 1",
    AlarmCode.GRIPPER_2_FAULT: "Авария захвата 2",
    AlarmCode.SAFETY_INTERLOCK: "Защитная блокировка",
    AlarmCode.HOMING_LOST: "Потеря базирования",
    AlarmCode.DRIVES_DISABLED: "Приводы отключены",
    AlarmCode.PLC_HEARTBEAT_LOST: "Потерян heartbeat PLC",
    AlarmCode.EXTERNAL_STOP: "Движение остановлено внешней командой",
    AlarmCode.MODE_CHANGE_DURING_COMMAND: "Смена режима во время команды",
}


# RobotStatusWord, register 1108
STATUS_CONTROLLER_ON = 0x0001
STATUS_AUTOMATIC_MODE = 0x0002
STATUS_REMOTE_ENABLED = 0x0004
STATUS_DRIVES_ENABLED = 0x0008
STATUS_HOMED = 0x0010
STATUS_EMERGENCY_STOP = 0x0020
STATUS_ROBOT_ALARM = 0x0040
STATUS_ROBOT_READY = 0x0080
STATUS_POSITION_VALID = 0x0100
STATUS_SIMULATOR_ACTIVE = 0x0200  # Project marker; a real SC-500 leaves this clear.


# GripperStatus, register 1106
GRIPPER_1_OPEN = 0x0001
GRIPPER_1_CLOSED = 0x0002
GRIPPER_2_OPEN = 0x0004
GRIPPER_2_CLOSED = 0x0008
ROTATED_TO_BLANK = 0x0010
ROTATED_TO_DETAIL = 0x0020


MOVEMENT_COMMANDS = frozenset(range(10, 26))
GRIPPER_COMMANDS = frozenset(range(2, 6))
ROTATION_COMMANDS = frozenset(range(6, 8))
MAGAZINE_COMMANDS = frozenset(range(23, 26))
