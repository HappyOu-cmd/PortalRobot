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
