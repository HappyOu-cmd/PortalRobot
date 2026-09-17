from pathlib import Path


WORKSPACE = Path(__file__).resolve().parents[2]
CELL_MANAGER = (
    WORKSPACE
    / "Portal_robot"
    / "Device"
    / "application"
    / "FB"
    / "FB_CELL_MANAGER"
    / "FB_CELL_MANAGER.st"
)
MAGAZINE = (
    WORKSPACE
    / "Portal_robot"
    / "Device"
    / "application"
    / "FB"
    / "FB_MAGAZINE.st"
)


def test_new_automatic_start_forgets_previous_magazine_slots() -> None:
    source = CELL_MANAGER.read_text(encoding="utf-8-sig")
    start = source.index("ELSIF rtStart.Q AND NOT xManual THEN")
    end = source.index(
        "eState := E_CELL_MANAGER_STATE.PRESTART_IDENTIFY;",
        start,
    )
    start_transition = source[start:end]

    assert "iTakeSlot := SINT#0;" in start_transition
    assert "iPutSlot := SINT#0;" in start_transition
    assert "iTakeOriginSlot := SINT#0;" in start_transition


def test_both_payloads_are_routed_instead_of_raising_cell_error() -> None:
    source = CELL_MANAGER.read_text(encoding="utf-8-sig")
    start = source.index("E_CELL_MANAGER_STATE.PLAN_TARGET:")
    end = source.index("E_CELL_MANAGER_STATE.MAGAZINE_EXECUTE:", start)
    planner = source[start:end]

    assert "AND stRobotStatus.xDetailAvailable THEN" in planner
    assert "eMachineOperation := E_MACHINE_OPERATION.LOAD;" in planner
    assert "eMagazineOperation := E_MAGAZINE_OPERATION.PUT;" in planner
    assert "ERR_BOTH_GRIPPERS" not in planner


def test_magazine_enable_accepts_both_payloads_when_a_free_slot_exists() -> None:
    source = MAGAZINE.read_text(encoding="utf-8-sig")
    start = source.index("Status.xCanEnable := FALSE;")
    end = source.index("// Отсутствие заготовок", start)
    enable_contract = source[start:end]

    assert "stRobotStatus.xBlankAvailable OR stRobotStatus.xDetailAvailable" in enable_contract
    assert "Status.xCanEnable := Status.xCanPut;" in enable_contract
