"""Reproduce recovery/physical-alarm defects from current ST; optional JSON.

Exit 1 means a reproduced defect; 0 means none of the selected defects appeared.
Unexpected exceptions remain errors. No PLC/network/database API is used.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from .cell import Machine, global_record, record
from .recovery import RecoveryCell
from .st_runtime import Program, StArray


def compact_trace(trace):
    keys = ("state", "robot_state", "robot_error", "motion_error", "magazines_error",
            "geometry_error", "geometry_reset_busy", "group_error", "soft_reset_pending",
            "robot_reset_allowed", "robot_execute", "robot_stop", "manual", "start_allowed")
    result, previous = [], None
    for item in trace:
        signature = [item.get(key) for key in keys]
        if signature != previous:
            result.append({"scan": item["scan"], "clock_ms": item.get("clock_ms"),
                           **{key: item.get(key) for key in keys}})
            previous = signature
    return result


def physical_alarm_loss(index=1):
    """NORMAL routes the raw DI through this injector with Request disabled."""
    cell = RecoveryCell(start=False)
    owner, injector = cell.machine_blocks[index - 1], cell.machine_faults[index - 1]
    r = cell.registry
    source = (r.root / "PLC_PRG.RunMachines.st").read_text(encoding="utf-8-sig")
    settings_names = set(re.findall(r"GVL_CELL_SETTINGS\.(\w+)", source)) | {"xErrorSimulationEnabled"}
    settings = global_record(r, "GVL/GVL_CELL_SETTINGS.gvl.st", cell.g, settings_names)
    settings.eTestEnvironment = r.enums["E_CELL_TEST_ENVIRONMENT"].NORMAL
    hmi_names = set(re.findall(r"GVL_HMI\.(\w+)", source)) | {"xErrorSimulationEnable"}
    hmi = global_record(r, "GVL/GVL_HMI.gvl.st", cell.g, hmi_names - {"stTestScenario"})
    # NORMAL never reads the scenario's multidimensional stock arrays. Only
    # these declared machine fields are arguments of the inactive init channel.
    hmi._types["stTestScenario"] = "ST_TEST_SCENARIO_BUFFER"
    hmi.stTestScenario = record(auiMachineState=StArray(1, [1] * 3, "UINT"),
                                auiMachineType=StArray(1, [1] * 3, "UINT"))
    for i in (1, 2, 3): hmi.axMachineUsed[i] = True
    machine = record(astPhysicalInput=StArray(1, [b.Status for b in cell.machine_sim], "ST_MACHINE_IO_STATUS"),
        Status=StArray(1, [b.Status for b in cell.machine_blocks], "ST_MACHINE_PUBLIC"),
        Command=StArray(1, [b.Command for b in cell.machine_blocks], "ST_MACHINE_COMMAND"),
        Diag=StArray(1, [b.Diag for b in cell.machine_blocks], "ST_MACHINE_DIAG"),
        Error=StArray(1, [b.Error for b in cell.machine_blocks], "ST_MACHINE_ERRORS"))
    raw = machine.astPhysicalInput[index]
    raw.xAlarm = True
    control = record(xReset=False, xManual=False, xGlobalError=False, xStop=False, xDisable=False)
    environment = {**cell.g, **r.enums, "_types": {}, "GVL_CELL_SETTINGS": settings, "GVL_HMI": hmi,
        "GVL_MACHINE": machine, "GVL_ROBOT": record(Status=cell.robot, Diag=cell.robot_block.Diag),
        "GVL_CELL_CONTROL": control, "GVL_CELL_MANAGER": record(Command=cell.manager.Command), "ROBOT": cell.robot_block,
        "xTestInitializePulse": False, "xTestAbortActive": False, "xIoManualActive": False, "xMotionBusy": False,
        "axMachinePointsReady": StArray(1, [True] * 3, "BOOL"),
        "astMachineStatusRaw": StArray(1, [r.value("ST_MACHINE_IO_STATUS", cell.g) for _ in range(3)], "ST_MACHINE_IO_STATUS"),
        "astMachineFaultRequest": StArray(1, [b.FaultRequest for b in cell.machine_sim], "ST_MACHINE_FAULT_REQUEST")}
    for i in (1, 2, 3):
        environment.update({f"MACHINE_{i}": cell.machine_blocks[i - 1], f"MACHINE_{i}_SIM": cell.machine_sim[i - 1],
                            f"MACHINE_{i}_FAULT": cell.machine_faults[i - 1]})
    # Execute the actual NORMAL/SIMULATION input selection and all three owner calls.
    # This also catches a future fix that bypasses the injector in NORMAL.
    program = Program(source, "RunMachines:full NORMAL scan")
    def scan():
        cell.clock.now += 100
        program.execute(environment)
    scan()
    idle = {"error": owner.Error.dwErrorActive, "can_accept_service": owner.Status.xCanAcceptService}
    # An existing owner fault must remain latched while its physical alarm is high.
    owner.eState = cell.registry.enums["E_MACHINE_STATE"].ERROR
    owner.Error.dwErrorActive = owner.ERR_MACHINE_IDLE
    scan()
    reset_allowed = owner.Status.xResetAllowed
    control.xReset = True; scan()
    cleared = not owner.Error.dwErrorActive
    return cell, {"finding": "F006", "product_types": 1, "machine": index,
                  "physical_alarm": raw.xAlarm, "injection_enabled": injector.Request.xEnabled,
                  "alarm_seen_by_machine": injector.MachineStatus.xAlarm, "idle_owner": idle,
                  "reset_allowed_with_live_physical_alarm": reset_allowed,
                  "reset_cleared_with_live_physical_alarm": cleared,
                  "violation": raw.xAlarm and (not injector.MachineStatus.xAlarm or cleared)}


def reproduce(finding):
    if finding == "F006":
        return physical_alarm_loss()
    if finding == "F004":
        cell = RecoveryCell()
        while cell.scans < 50:
            cell.scan()
        cell.group_fault = True
        for _ in range(12):
            cell.scan()
        cell.group_fault = False
    elif finding == "F005":
        cell = RecoveryCell(start=False, machines=[Machine("done"), Machine(), Machine()],
                            magazines=[[1, 0, 0, 0], [1, 0, 0, 0]])
        assert cell.call(1)
        cell.begin()
        for _ in range(600):
            cell.scan()
            if cell.geometry.astSignals[1].xRobotInteraction:
                break
        else:
            raise AssertionError("No actual robot/GK interaction")
        cell.station_sim[0].xAlarm = True
        for _ in range(15):
            cell.scan()
        cell.station_sim[0].xAlarm = False
    else:
        raise ValueError(finding)
    cell.manual = True
    for _ in range(8):
        cell.scan()
    before = {"errors": cell.errors(), "snapshot": cell.snapshot()}
    cell.pulse_reset()
    first = {"errors": cell.errors(), "snapshot": cell.snapshot()}
    additional_reset = any(first["errors"].values())
    if additional_reset:
        cell.pulse_reset()
    second = {"errors": cell.errors(), "snapshot": cell.snapshot()}
    ready = cell.ready_for_start()
    started = cell.restart()
    assert ready["ready"] and started, (finding, ready, cell.snapshot())
    for _ in range(420):
        cell.scan()
        assert not any(cell.errors().values()), (finding, cell.errors(), cell.snapshot())
    return cell, {"finding": finding, "product_types": 1,
                  "violation": any(first["errors"].values()), "before_reset": before,
                  "after_one_reset": first, "after_second_reset": second,
                  "additional_reset_sent": additional_reset,
                  "recovery_ready": ready["ready"], "new_start_accepted": started,
                  "post_restart_scans_without_error": 420,
                  "final": cell.snapshot(), "trace": compact_trace(cell.trace)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reproduce", choices=("F004", "F005", "F006"))
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    results, hashes = [], {}
    for finding in (args.reproduce,) if args.reproduce else ("F004", "F005", "F006"):
        cell, result = reproduce(finding)
        results.append(result)
        for path in sorted(cell.registry.root.rglob("*.st")):
            hashes[path.relative_to(cell.registry.root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    report = {"scope": "offline current ST, one product type; bounded drive feedback",
              "findings": results, "st_sha256": hashes}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    for result in results:
        print(json.dumps({key: value for key, value in result.items()
                          if key in ("finding", "violation", "recovery_ready", "new_start_accepted", "post_restart_scans_without_error")}, ensure_ascii=False))
    return int(any(result["violation"] for result in results))


if __name__ == "__main__":
    raise SystemExit(main())
