"""Check W29 across controlled-stop scans using the actual PLC source."""

from pathlib import Path
import re

import pytest

from test_hmi_command_contract import execute


APP = Path(__file__).resolve().parents[2] / "Portal_robot/Device/application"
MANAGER = (APP / "FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st").read_text(encoding="utf-8-sig")
BOUNDARIES = ["PLAN_TARGET", "WAIT_TARGET", "SELECT_FALLBACK", "WAIT_MAGAZINE"]
CONDITION_MATCH = re.search(r"\bxNoDetailDestinationCondition\s*:=.*?;", MANAGER, re.S)
assert CONDITION_MATCH
CONDITION = CONDITION_MATCH[0]
EVENT_START = MANAGER.index("IF xNoDetailDestinationCondition\n")
EVENT_END = MANAGER.index("\nIF xNoBlankStockCondition", EVENT_START)
EVENT = MANAGER[EVENT_START:EVENT_END]
STOP_START = MANAGER.index("IF rtStop.Q OR xManual THEN")
STOP_END = MANAGER.index("\n// Ошибка робота", STOP_START)
STOP = MANAGER[STOP_START:STOP_END]


def warning_state(**overrides):
    values = {
        "xRunning": True,
        "rtStart.Q": False,
        "rtStop.Q": False,
        "xStopRequested": False,
        "xManual": False,
        "xMagazineExchangeActive": False,
        "stRobotStatus.xDetailAvailable": True,
        "uiDetailPayloadType": 1,
        "Config.uiTypeCount": 3,
        "xAnyMagazineDetailSlotAvailable": False,
        "eState": "E_CELL_MANAGER_STATE.PLAN_TARGET",
        "xDetailDestinationWarningActive": False,
        "Diag.stWarning.uiCode": 0,
        "Diag.stWarning.udiSequence": 7,
        "WRN_NO_DETAIL_DESTINATION": 29,
    }
    values.update(overrides)
    return values


def scan(values):
    # Preserve the PLC order: condition, warning edge, then the Stop/Start latch.
    source = CONDITION + "\n" + EVENT + "\n" + STOP
    for enum in re.findall(r"\bE_\w+\.\w+", source):
        values[enum] = enum
    execute(source, values)


@pytest.mark.parametrize("phase", BOUNDARIES)
@pytest.mark.parametrize("stop", ["rtStop.Q", "xStopRequested"])
def test_stop_suppresses_w29_at_every_planning_boundary(phase, stop):
    values = warning_state(**{"eState": f"E_CELL_MANAGER_STATE.{phase}", stop: True})
    scan(values)
    assert values["Diag.stWarning.udiSequence"] == 7
    assert values["Diag.stWarning.uiCode"] == 0
    assert not values["xDetailDestinationWarningActive"]


@pytest.mark.parametrize("phase", BOUNDARIES + ["IDLE"])
def test_missing_slot_still_warns_during_automatic_operation_or_start(phase):
    values = warning_state(**{
        "eState": f"E_CELL_MANAGER_STATE.{phase}",
        "xRunning": phase != "IDLE",
        "rtStart.Q": phase == "IDLE",
    })
    scan(values)
    assert values["Diag.stWarning.uiCode"] == 29
    assert values["Diag.stWarning.udiSequence"] == 8
    assert values["xDetailDestinationWarningActive"]


@pytest.mark.parametrize("overrides", [
    {"xAnyMagazineDetailSlotAvailable": True},
    {"stRobotStatus.xDetailAvailable": False},
    {"xManual": True},
    {"xMagazineExchangeActive": True},
    {"uiDetailPayloadType": 0},
    {"uiDetailPayloadType": 4},
    {"eState": "E_CELL_MANAGER_STATE.SERVICE_TARGET"},
    {"xRunning": False, "eState": "E_CELL_MANAGER_STATE.IDLE"},
])
def test_w29_requires_a_real_automatic_detail_destination_problem(overrides):
    values = warning_state(**overrides)
    scan(values)
    assert values["Diag.stWarning.udiSequence"] == 7
    assert not values["xDetailDestinationWarningActive"]


def test_stop_finishes_machine_service_then_idles_without_w29():
    values = warning_state(**{
        "eState": "E_CELL_MANAGER_STATE.SERVICE_TARGET", "rtStop.Q": True,
    })
    scan(values)
    assert values["xStopRequested"]
    values["rtStop.Q"] = False
    for phase in BOUNDARIES + ["IDLE"]:
        values["eState"] = f"E_CELL_MANAGER_STATE.{phase}"
        values["xRunning"] = phase != "IDLE"
        scan(values)
        assert values["Diag.stWarning.udiSequence"] == 7
        assert not values["xDetailDestinationWarningActive"]


def test_stop_clears_warning_episode_and_restart_can_warn_once_again():
    values = warning_state()
    scan(values)
    assert values["Diag.stWarning.udiSequence"] == 8
    values["rtStop.Q"] = True
    scan(values)
    assert not values["xDetailDestinationWarningActive"]
    # Stop clears the condition, while the existing journal entry needs acknowledgement.
    assert values["Diag.stWarning.uiCode"] == 29
    assert values["Diag.stWarning.udiSequence"] == 8
    values.update({"rtStop.Q": False, "xStopRequested": False})
    for _ in range(5):
        scan(values)
        assert values["Diag.stWarning.udiSequence"] == 9


def test_start_cancels_pending_stop_and_restores_warning_on_next_scan():
    values = warning_state(**{"xStopRequested": True, "rtStart.Q": True})
    scan(values)
    assert not values["xStopRequested"]
    assert values["Diag.stWarning.udiSequence"] == 7
    values["rtStart.Q"] = False
    scan(values)
    assert values["Diag.stWarning.uiCode"] == 29
    assert values["Diag.stWarning.udiSequence"] == 8
