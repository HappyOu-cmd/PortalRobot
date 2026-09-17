"""Execute the limited Boolean/assignment ST mode decision, not a CODESYS runtime.

This checks the actual source across scan boundaries; hardware/library behaviour
and compilation still require CODESYS.
"""
from pathlib import Path
import re

import pytest


APPLICATION = Path(__file__).resolve().parents[2] / "Portal_robot/Device/application"


def execute_st_statements(source: str, values: dict) -> None:
    source = re.sub(r"//[^\n]*", "", source).strip()
    token = re.compile(r"(?:(IF|ELSIF)\s+(.*?)\s+THEN\b|(ELSE)\b|(END_IF);|([\w.]+)\s*:=\s*(.*?);)", re.S)

    def expression(text: str) -> str:
        text = re.sub(r"(?:UDINT|UINT)#(\d+)", r"\1", text)
        text = re.sub(r"\b(?:TRUE|FALSE|NOT|AND|OR)\b", lambda m: {
            "TRUE": "True", "FALSE": "False", "NOT": "not", "AND": "and", "OR": "or",
        }[m[0]], text)
        text = text.replace("<>", "!=")
        text = re.sub(r"(?<![!<>=])=(?!=)", "==", text)
        text = re.sub(r"\b(?:GVL_\w+\.[\w.]+|uiCellModeRejectReason|udiCellModeCommandSnapshot)\b",
                      lambda m: f"values[{m[0]!r}]", text)
        return " ".join(text.split())

    lines, depth = [], 0
    while source:
        match = token.match(source)
        assert match is not None, f"Unsupported ST in contract test: {source[:100]}"
        branch, condition, otherwise, end, target, value = match.groups()
        if branch == "ELSIF" or otherwise or end:
            depth -= 1
        if branch:
            lines.append("    " * depth + ("if " if branch == "IF" else "elif ") + expression(condition) + ":")
            depth += 1
        elif otherwise:
            lines.append("    " * depth + "else:")
            depth += 1
        elif target:
            lines.append("    " * depth + f"values[{target!r}] = {expression(value)}")
        source = source[match.end():].strip()
    assert depth == 0
    exec("\n".join(lines), {"values": values, "__builtins__": {}})


SAFETY_SOURCE = (APPLICATION / "PLC_PRG.RunSafety.st").read_text(encoding="utf-8-sig")
MODE_SOURCE = SAFETY_SOURCE[SAFETY_SOURCE.index("uiCellModeRejectReason :="):SAFETY_SOURCE.index("xRobotHmiPermit :=")]
PUBLISH_SOURCE = (APPLICATION / "PLC_PRG.PublishHmi.st").read_text(encoding="utf-8-sig")
PUBLISH_MODE = PUBLISH_SOURCE[PUBLISH_SOURCE.index("GVL_HMI.xCellManual :="):PUBLISH_SOURCE.index("GVL_HMI.xErrorSimulationEnabled :=")]


def state(**overrides):
    return {
        "GVL_HMI.xCellManualRequest": True,
        "GVL_HMI.udiCellModeCommandSeq": 1,
        "GVL_HMI.udiCellModeAckSeq": 0,
        "GVL_HMI.uiCellModeResult": 0,
        "GVL_CELL_CONTROL.xGlobalError": False,
        "GVL_CELL_CONTROL.xManual": False,
        "GVL_CELL_MANAGER.Status.xRunning": False,
        **overrides,
    }


@pytest.mark.parametrize("arrival", ["before_scan", "after_decision", "after_publish"])
def test_mode_request_survives_each_plc_scan_boundary(arrival):
    values = state(**{"GVL_HMI.udiCellModeCommandSeq": 0})
    for step in ["before_scan", "after_decision", "after_publish"]:
        if step == arrival:
            values["GVL_HMI.udiCellModeCommandSeq"] = 1
        if step == "before_scan":
            execute_st_statements(MODE_SOURCE, values)
        elif step == "after_decision":
            execute_st_statements(PUBLISH_MODE, values)
    execute_st_statements(MODE_SOURCE, values)
    execute_st_statements(PUBLISH_MODE, values)
    assert values["GVL_HMI.xCellManual"] is True
    assert values["GVL_HMI.udiCellModeAckSeq"] == 1
    assert values["GVL_HMI.uiCellModeResult"] == 1


def test_rejected_manual_request_is_consumed_and_never_applied_after_stop():
    values = state(**{"GVL_CELL_MANAGER.Status.xRunning": True})
    execute_st_statements(MODE_SOURCE, values)
    execute_st_statements(PUBLISH_MODE, values)
    assert values["GVL_HMI.uiCellModeResult"] == 2
    assert values["uiCellModeRejectReason"] == 2
    values["GVL_CELL_MANAGER.Status.xRunning"] = False
    execute_st_statements(MODE_SOURCE, values)
    assert values["GVL_CELL_CONTROL.xManual"] is False
    assert values["uiCellModeRejectReason"] == 0
    values["GVL_HMI.udiCellModeCommandSeq"] = 2
    execute_st_statements(MODE_SOURCE, values)
    assert values["GVL_CELL_CONTROL.xManual"] is True


def test_safety_rejects_automatic_and_keeps_manual_after_recovery():
    values = state(**{"GVL_HMI.xCellManualRequest": False, "GVL_CELL_CONTROL.xGlobalError": True})
    execute_st_statements(MODE_SOURCE, values)
    execute_st_statements(PUBLISH_MODE, values)
    assert values["GVL_HMI.uiCellModeResult"] == 3
    assert values["GVL_HMI.xCellManual"] is True
    values["GVL_CELL_CONTROL.xGlobalError"] = False
    execute_st_statements(MODE_SOURCE, values)
    assert values["GVL_CELL_CONTROL.xManual"] is True


def test_two_recovery_episodes_accept_one_manual_request_each():
    values = state()
    for sequence, manual in [(1, True), (2, False), (3, True)]:
        values["GVL_HMI.udiCellModeCommandSeq"] = sequence
        values["GVL_HMI.xCellManualRequest"] = manual
        execute_st_statements(MODE_SOURCE, values)
        execute_st_statements(PUBLISH_MODE, values)
        assert values["GVL_HMI.xCellManual"] is manual
        assert values["GVL_HMI.udiCellModeAckSeq"] == sequence


def test_plc_does_not_write_gateway_owned_request_buffer():
    for path in APPLICATION.rglob("*.st"):
        source = path.read_text(encoding="utf-8-sig")
        assert not re.search(r"GVL_HMI\.(?:xCellManualRequest|udiCellModeCommandSeq)\s*:=", source), path
    assert "OR (GVL_HMI.xCellManual AND" not in (APPLICATION / "PLC_PRG.ReadHmiInputs.st").read_text(encoding="utf-8-sig")
