"""Bounded offline audit. Run: python -m robot_simulator.plc_model.audit.

Exit 1 means a reproduced PLC decision defect or an invariant violation.
Reports distinguish known decision defects from environment/model exceptions.
No CODESYS, OPC UA, Modbus, gateway or database write is performed.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import itertools
import json
import random
import time
from collections import Counter
from pathlib import Path

from .cell import Cell, Machine
from .findings import REPRODUCTIONS
from .st_runtime import Registry


def bits(mask, count):
    return [bool(mask & (1 << i)) for i in range(count)]


def eligible(cell, index):
    status = cell.manager.astMachineStatus[index]
    return (status.xEnabled and not status.xError and not status.xDisablePending
            and not cell.manager.axGeometryUnloadBlocked[index]
            and 1 <= cell.manager.Config.auiMachineType[index] <= cell.types)


def available(cell, index):
    m = cell.manager; status = m.astMagazineStatus[index]
    return (status.xEnabled and status.xReady and not status.xBusy and not status.xError
            and not status.xDisablePending and not status.xFinished
            and not m.axMagazineExchangeInProgress[index] and not m.axMagazineAutoSwapPending[index])


def immediate_work(cell):
    """Existence of an admitted useful action; does not duplicate dispatch priorities."""
    m, robot, enums = cell.manager, cell.robot, cell.registry.enums
    free_geometry = any(s.xEnabled and s.xReady and s.xConfigured and not s.xError and not s.xDisablePending
                        for s in cell.geometry.astStatus.values)
    if robot.xDetailAvailable and m.xGeometryHeld and free_geometry:
        return True
    if robot.xBlankAvailable:
        for index in range(1, 4):
            status = m.astMachineStatus[index]
            if (eligible(cell, index) and status.xCanAcceptService and status.xServiceRequired
                    and m.Config.auiMachineType[index] == robot.uiBlankPayloadType
                    and (status.ePartState == enums["E_PART_STATE"].EMPTY or not robot.xDetailAvailable)):
                return True
    for magazine in (1, 2):
        if not available(cell, magazine):
            continue
        stock = m.astMagazineStatus[magazine].stTypeStatus
        if robot.xDetailAvailable:
            if 1 <= robot.uiDetailPayloadType <= cell.types and stock.aiFreeSlot[robot.uiDetailPayloadType] > 0:
                return True
            if not robot.xBlankAvailable and robot.xGripper1Open and m.uiReturnMagazine in (0, magazine):
                for index in range(1, 4):
                    status = m.astMachineStatus[index]
                    product = m.Config.auiMachineType[index]
                    if (eligible(cell, index) and stock.aiBlankSlot[product] > 0
                            and (status.xProcessing or m.axMachineStartPending[index]
                                 or status.xCanAcceptService and status.xServiceRequired)):
                        return True
            continue
        if robot.xBlankAvailable:
            continue
        for index in range(1, 4):
            status = m.astMachineStatus[index]; product = m.Config.auiMachineType[index]
            if not eligible(cell, index) or not status.xCanAcceptService or not status.xServiceRequired:
                continue
            if stock.aiBlankSlot[product] > 0:
                return True
            if status.ePartType == enums["E_PART_TYPE"].DETAIL and stock.aiFreeSlot[product] > 0:
                return True
    return False


def assert_progress(cell, stalled):
    if stalled >= 32 and not cell.processing and not cell.service_jobs and not cell.swap_jobs:
        assert not immediate_work(cell), ("Admitted work makes no progress for 32 scans", cell.snapshot())


def station_matrix(registry):
    cell = Cell(autostart=False, registry=registry)
    states = ("off", "free", "occupied", "error", "disabling", "unconfigured", "recovery", "running")
    count = 0
    for pair in itertools.product(states, repeat=2):
        for index, mode in enumerate(pair, 1):
            status = cell.geometry.astStatus[index]
            status.xEnabled = mode != "off"
            status.xConfigured = mode != "unconfigured"
            status.xError = mode == "error"
            status.xDisablePending = mode == "disabling"
            status.uiState = 5 if mode == "recovery" else 1
            status.xReady = mode == "free"
        for supported, require_free, source in itertools.product((False, True), (False, True), range(4)):
            cell.geometry.xSupported = supported
            selected = cell.manager.state["F_GEOMETRY_SELECT_STATION"](xRequireFree=require_free, uiMachine=source)
            admitted = [i for i, mode in enumerate(pair, 1) if supported and mode not in ("off", "error", "disabling", "unconfigured", "recovery") and (not require_free or mode == "free")]
            assert (selected in admitted) if admitted else selected == 0, (pair, supported, require_free, source, selected)
            if len(admitted) == 2:
                assert selected == (2 if source == 3 else 1)
            count += 1
    return {"cases": count, "violations": 0}


def selector_matrix(registry):
    count = 0
    modes = ("disabled", "empty", "done", "processing", "pending", "error", "disabling", "unready")
    for types in (1, 2, 3):
        contents = list(range(1, types + 1)) + [0] * (4 - types)
        cell = Cell(types=types, magazines=[contents, contents], autostart=False, registry=registry)
        m, enums = cell.manager, cell.registry.enums
        m.xRunning = True
        m.stMagazineStatus = m.astMagazineStatus[1]
        for machine_modes in itertools.product(modes, repeat=3):
            for index, mode in enumerate(machine_modes, 1):
                cell.set_machine(index, Machine(mode, 1 + (index - 1) % types, remaining=index + 1))
            for free_mask, call_mask in itertools.product(range(4), range(8)):
                for index, free in enumerate(bits(free_mask, 2), 1):
                    status = cell.geometry.astStatus[index]
                    status.xEnabled = status.xConfigured = True
                    status.xReady = free
                    status.xError = status.xDisablePending = False
                    status.uiState = 1 if free else 4
                for index, called in enumerate(bits(call_mask, 3), 1):
                    call = cell.geometry.astCalls[index]
                    call.udiId, call.uiMachine, call.uiState = index, index, int(called)
                m.UpdateGeometryWait()
                for index in range(1, 4):
                    status = m.astMachineStatus[index]
                    expected = bool(call_mask & (1 << (index - 1))) and not free_mask and status.ePartState == enums["E_PART_STATE"].LOADED and not status.xBusy
                    assert m.axGeometryUnloadBlocked[index] == expected
                before = m.SelectMachineBeforeTake()
                payload = 1 + count % types
                held = m.SelectMachineForHeldBlank(uiProductType=payload, uiCurrentMachine=count % 4)
                unload = m.SelectMachineForUnload(uiCurrentMachine=count % 4)
                for selected in (before, held, unload):
                    if selected:
                        assert eligible(cell, selected), (machine_modes, free_mask, call_mask, selected)
                if held:
                    assert m.Config.auiMachineType[held] == payload
                ready = [i for i in range(1, 4) if eligible(cell, i) and m.astMachineStatus[i].xCanAcceptService and m.astMachineStatus[i].xServiceRequired]
                if ready:
                    assert before, (machine_modes, free_mask, call_mask)
                if any(eligible(cell, i) and m.Config.auiMachineType[i] == payload for i in range(1, 4)):
                    assert held
                if any(i in ready and m.astMachineStatus[i].ePartType == enums["E_PART_TYPE"].DETAIL for i in range(1, 4)):
                    assert unload
                count += 1
    return {"cases": count, "violations": 0}


def start_matrix(registry):
    count, violations, examples = 0, 0, []
    by_types = Counter()
    for types in (1, 2, 3):
        cell = Cell(types=types, autostart=False, registry=registry)
        m = cell.manager
        templates = {}
        for stock_mask, enabled in itertools.product(range(1 << types), (False, True)):
            contents = [i for i in range(1, types + 1) if stock_mask & (1 << (i - 1))]
            contents += [0] * (4 - len(contents))
            magazine = cell.magazines[0]
            cell.fill(magazine.stInventory, contents)
            magazine(xTestInitialize=True, xTestEnabled=enabled)
            magazine.xTestInitialize = False
            templates[stock_mask, enabled] = copy.deepcopy(magazine.Status)
        for assignment, machine_mask in itertools.product(itertools.product(range(1, types + 1), repeat=3), range(8)):
            for index, product_type in enumerate(assignment, 1):
                cell.set_machine(index, Machine("empty" if machine_mask & (1 << (index - 1)) else "disabled", product_type))
            for stocks, enabled_mask in itertools.product(itertools.product(range(1 << types), repeat=2), range(4)):
                for index, enabled in enumerate(bits(enabled_mask, 2), 1):
                    m.astMagazineStatus[index] = templates[stocks[index - 1], enabled]
                expected = any(machine_mask & (1 << (machine - 1)) and enabled_mask & (1 << (magazine - 1))
                               and stocks[magazine - 1] & (1 << (assignment[machine - 1] - 1))
                               for machine in range(1, 4) for magazine in (1, 2))
                m.eState = cell.registry.enums["E_CELL_MANAGER_STATE"].IDLE
                m.xRunning = False
                m.uiActiveMagazine = m.uiSupplyMagazine = m.uiReturnMagazine = m.uiSelectedMachine = 0
                m.rtStart.previous = False
                m(xStart=True)
                accepted = m.eState == cell.registry.enums["E_CELL_MANAGER_STATE"].PRESTART_IDENTIFY
                if accepted != bool(expected):
                    violations += 1; by_types[types] += 1
                    if len(examples) < 3:
                        examples.append({"types": types, "assignment": assignment, "machine_mask": machine_mask,
                                         "stocks": stocks, "enabled_mask": enabled_mask, "expected": bool(expected), "accepted": accepted})
                count += 1
    return {"cases": count, "violations": violations, "family": "F001", "by_types": dict(by_types), "examples": examples}


def magazine_matrix(registry):
    cell = Cell(types=3, machines=[Machine("done", i) for i in (1, 2, 3)], autostart=False, registry=registry)
    m, enums = cell.manager, cell.registry.enums
    modes = ("ready", "disabled", "error", "busy", "disabling", "swapping", "swap_pending", "finished")
    contents = ([0, 0, 0, 0], [1, 2, 3, 1], [-1, -2, -3, -1], [2, 2, 2, 2])
    templates = []
    for slots in contents:
        magazine = cell.magazines[0]
        cell.fill(magazine.stInventory, slots)
        magazine.UpdateTypeStatus(stMagazineInventory=magazine.stInventory)
        templates.append(copy.deepcopy(magazine.Status.stTypeStatus))
    count, failures, examples = 0, 0, []
    for pair, stocks, detail, owner, grip in itertools.product(itertools.product(modes, repeat=2),
            itertools.product(range(len(contents)), repeat=2), range(1, 4), range(3), ("open", "closed_empty", "blank")):
        cell.hold(1 if grip == "blank" else 0, detail)
        cell.robot.xGripper1Open = grip == "open"
        cell.robot.xGripper1Closed = grip != "open"
        m.uiBlankPayloadType, m.uiDetailPayloadType = cell.robot.uiBlankPayloadType, detail
        m.uiActiveMagazine, m.uiReturnMagazine, m.uiSupplyMagazine = owner or 1, owner, owner
        m.xRunning, m.xStart, m.xStopRequested = True, False, False
        m.Error.dwErrorActive = 0
        m.eState = enums["E_CELL_MANAGER_STATE"].PLAN_TARGET
        m.eMagazineOperation = enums["E_MAGAZINE_OPERATION"].NONE
        for index, mode in enumerate(pair, 1):
            status = m.astMagazineStatus[index]
            status.xEnabled = mode != "disabled"
            status.xReady = mode not in ("disabled", "busy", "error")
            status.xError, status.xBusy = mode == "error", mode == "busy"
            status.xDisablePending, status.xFinished = mode == "disabling", mode == "finished"
            status.stTypeStatus = templates[stocks[index - 1]]
            m.axMagazineExchangeInProgress[index] = mode == "swapping"
            m.axMagazineAutoSwapPending[index] = mode == "swap_pending"
        possible = any(available(cell, i) and m.astMagazineStatus[i].stTypeStatus.aiFreeSlot[detail] > 0 for i in (1, 2))
        m()
        if m.eState == enums["E_CELL_MANAGER_STATE"].MAGAZINE_EXECUTE:
            destination = m.uiActiveMagazine
            assert available(cell, destination), (pair, stocks, grip, cell.snapshot())
            stock = m.astMagazineStatus[destination].stTypeStatus
            if m.eMagazineOperation == enums["E_MAGAZINE_OPERATION"].PUT:
                assert stock.aiFreeSlot[detail] == m.iPutSlot and m.iPutSlot > 0
            elif m.eMagazineOperation == enums["E_MAGAZINE_OPERATION"].CHANGE:
                assert grip == "open" and not cell.robot.xBlankAvailable
                assert stock.aiBlankSlot[m.uiSelectedType] == m.iTakeSlot and m.iTakeSlot > 0
                assert m.iPutSlot == m.iTakeSlot or stock.aiFreeSlot[detail] == m.iPutSlot
                assert owner in (0, destination), "Foreign magazine CHANGE overrides the return owner"
            else:
                raise AssertionError(cell.snapshot())
        elif possible and not any(s.xBusy for s in m.astMagazineStatus.values):
            # A second boundary resolves a stale selected snapshot, if any.
            # An active magazine command must finish before ownership can move;
            # its Busy is an external dependency, not a self-deadlock.
            m()
            if m.eState != enums["E_CELL_MANAGER_STATE"].MAGAZINE_EXECUTE:
                failures += 1
                if len(examples) < 3:
                    examples.append({"modes": pair, "stocks": stocks, "detail": detail, "owner": owner, "grip": grip, "observed": cell.snapshot()})
        count += 1
    return {"cases": count, "violations": failures, "examples": examples}


def held_blank_matrix(registry):
    count = 0
    for types in (1, 2, 3):
        cell = Cell(types=types, magazines=[[1, 0, 0, 0], [1, 0, 0, 0]], autostart=False, registry=registry)
        m, enums = cell.manager, cell.registry.enums
        cell.hold(blank=1)
        m.uiBlankPayloadType = 1
        m.xRunning = True
        other_type = min(types, 2)
        for own_mode, alternative, mask, active, free, stocks in itertools.product(
                ("disabled", "error", "empty", "blocked"),
                ("disabled", "empty", "done", "processing", "pending", "unready"),
                range(4), (1, 2), itertools.product(range(3), repeat=2), range(4)):
            cell.set_machine(1, Machine("done" if own_mode == "blocked" else own_mode, 1))
            cell.set_machine(2, Machine(alternative, other_type))
            cell.set_machine(3, Machine("disabled", types))
            m.axGeometryUnloadBlocked[1] = own_mode == "blocked"
            m.axGeometryUnloadBlocked[2] = False
            m.stMagazineStatus = m.astMagazineStatus[active]
            m.uiActiveMagazine, m.uiSelectedMachine = active, 0
            m.xMagazine1Available, m.xMagazine2Available = bits(mask, 2)
            m.xMagazineReady = bool(mask & (1 << (active - 1)))
            for index in (1, 2):
                stock = m.astMagazineStatus[index].stTypeStatus
                for type_index in range(1, 4):
                    stock.aiFreeSlot[type_index] = 2 if free[index - 1] else 0
                    stock.auiFreeCount[type_index] = free[index - 1]
                    stock.aiBlankSlot[type_index] = 1 if type_index == other_type and stocks & (1 << (index - 1)) else 0
            # The selected ST snapshot is a value copy, just as in FB_CELL_MANAGER.
            m.stMagazineStatus = m.astMagazineStatus[active]
            result = m.CanReturnHeldBlank()
            own_eligible = any(eligible(cell, i) and m.Config.auiMachineType[i] == 1 for i in range(1, 4))
            useful_other = False
            if types > 1 and eligible(cell, 2):
                status = m.astMachineStatus[2]
                for magazine in (1, 2):
                    if not mask & (1 << (magazine - 1)):
                        continue
                    blank_can_continue = bool(stocks & (1 << (magazine - 1))) and alternative in ("empty", "done", "processing", "pending")
                    detail_has_destination = alternative == "done" and free[magazine - 1] > int(magazine == active)
                    useful_other |= blank_can_continue or detail_has_destination
            expected = types > 1 and m.xMagazineReady and free[active - 1] > 0 and not own_eligible and useful_other
            assert result == bool(expected), (types, own_mode, alternative, mask, active, free, stocks, result, expected)
            count += 1
    return {"cases": count, "violations": 0}


def apply_event(cell, event):
    if event.startswith("call"):
        cell.call(int(event[-1]))
    elif event.startswith("cancel"):
        cell.call(int(event[-1]), cancel=True)
    elif event.startswith("remove"):
        station = cell.stations[int(event[-1]) - 1]
        if station.Status.xSimulationRemoveAllowed:
            station.uiAction = 7
    elif event.startswith("disable_gk"):
        cell.stations[int(event[-1]) - 1].uiAction = 2
    elif event.startswith("enable_gk"):
        cell.stations[int(event[-1]) - 1].uiAction = 1
    elif event == "stop":
        cell.manager.xStop = True
    elif event == "none":
        pass
    else:
        raise ValueError(event)


def assert_inventory(cell):
    # Physical gripper feedback precedes the owner's commit by one PLC scan.
    # Once Done is released, every physical transfer must be reflected in stock.
    if not cell.robot.xDone:
        assert cell.inventory() == cell.initial_inventory, (cell.initial_inventory, cell.inventory(), cell.snapshot())


def event_orders(registry):
    events = ("call1", "call2", "call3", "cancel1", "cancel2", "cancel3", "disable_gk1", "disable_gk2", "remove1", "remove2")
    cases, scans, violations, errors = 0, 0, 0, []
    # All 100 ordered event pairs, at four distinct service boundaries.
    for first, second, offset in itertools.product(events, events, (0, 1, 2, 3)):
        cell = Cell(machines=[Machine("done") for _ in range(3)], magazines=[[0, 0], [0, 0]],
                    slots=2, geometry=(True, True), registry=registry)
        try:
            for _ in range(24):
                if cell.manager.eState == cell.registry.enums["E_CELL_MANAGER_STATE"].SERVICE_TARGET:
                    break
                cell.scan(); scans += 1
            for _ in range(offset):
                cell.scan(); scans += 1
            apply_event(cell, first); cell.scan(); scans += 1
            apply_event(cell, second)
            for _ in range(45):
                cell.scan(); scans += 1
                assert_inventory(cell)
                assert not cell.manager.Error.dwErrorActive, cell.snapshot()
        except (AssertionError, IndexError) as error:
            violations += 1
            if len(errors) < 6:
                errors.append({"events": [first, second], "offset": offset, "error": str(error), "trace": cell.trace[-12:]})
        cases += 1
    return {"cases": cases, "scans": scans, "violations": violations, "examples": errors}


def random_sequences(registry, seed, cases, progress):
    rng = random.Random(seed)
    failures, states, scans = [], set(), 0
    actions = ("call1", "call2", "call3", "cancel1", "cancel2", "cancel3", "remove1", "remove2", "none")
    for case_index in range(cases):
        types, mode = rng.randint(1, 3), case_index % 2
        machines = [Machine(rng.choice(("empty", "done", "processing", "disabled")), rng.randint(1, types),
                            remaining=rng.randint(2, 20), timed=bool(rng.getrandbits(1))) for _ in range(3)]
        magazines = [[rng.choice([0, *range(1, types + 1), *range(-types, 0)]) for _ in range(4)] for _ in range(2)]
        operator = [[rng.choice([0, *range(1, types + 1)]) for _ in range(4)] for _ in range(2)]
        geometry = tuple(bool(rng.getrandbits(1)) for _ in range(2))
        roles = tuple(rng.randint(1, 2) for _ in range(2))
        cell = Cell(types=types, mode=mode, roles=roles, slots=4, machines=machines, magazines=magazines,
                    operator=operator, geometry=geometry, registry=registry)
        cell.persistent.xAutoEnabled = bool(case_index % 3 == 0)
        for index in (1, 2, 3):
            cell.persistent.auiPeriod[index] = rng.choice((1, 2, 3, 20))
        cell.persistent.xWaitWhenOccupied = bool(case_index % 2)
        schedule = {at: rng.choice(actions) for at in range(7, 360, 29)}
        stalled, previous_operations = 0, sum(cell.operations.values())
        try:
            for at in range(400):
                if at in schedule:
                    apply_event(cell, schedule[at])
                cell.scan(); scans += 1
                assert_inventory(cell)
                assert not cell.manager.Error.dwErrorActive, cell.snapshot()
                operations = sum(cell.operations.values())
                # Count only a continuous opportunity to act. Work appearing
                # after an operator release must get a fresh progress window.
                stalled = stalled + 1 if operations == previous_operations and immediate_work(cell) else 0
                previous_operations = operations
                assert_progress(cell, stalled)
            states.update(cell.states)
        except (AssertionError, IndexError) as error:
            family = "F001" if not cell.manager.xRunning and cell.manager.eState == cell.registry.enums["E_CELL_MANAGER_STATE"].IDLE else "unclassified"
            failures.append({"seed": seed, "case": case_index, "family": family, "types": types, "mode": mode, "roles": roles,
                             "machines": [vars(spec) for spec in machines], "magazines": magazines, "operator": operator,
                             "geometry": geometry, "schedule": schedule, "error": str(error), "trace": cell.trace[-16:]})
        if (case_index + 1) % 16 == 0:
            progress(f"Random sequences: {case_index + 1}/{cases}")
    return {"cases": cases, "scans": scans, "violations": len(failures),
            "families": dict(Counter(f["family"] for f in failures)),
            "visited_states": sorted(states), "examples": failures[:8]}


def source_manifest(registry):
    paths = {Path(program.filename) for program in registry.programs.values() if Path(program.filename).exists()}
    paths.update((registry.root / "ST").rglob("*.st"))
    paths.update(registry.root / name for name in ("PLC_PRG.st", "PLC_PRG.RunGeometryControl.st", "PLC_PRG.RunTwoPallet.st",
                                                "PLC_PRG.RunCellControl.st", "PLC_PRG.RunMagazine.st", "Persistent_Value.gvl.st"))
    paths.update((registry.root / "GVL").glob("*.gvl.st"))
    return {path.relative_to(registry.root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}


def run_audit(*, seed=20261029, random_cases=64, progress=print):
    started = time.perf_counter(); registry = Registry()
    report = {"seed": seed, "scope": "bounded ST decision model; abstract machine service, motion and pallet mechanics", "matrices": {}}
    for name, run in (("stations", station_matrix), ("selectors", selector_matrix),
                      ("start", start_matrix), ("magazines", magazine_matrix), ("held_blank", held_blank_matrix),
                      ("event_orders", event_orders)):
        progress(f"Running {name}...")
        report["matrices"][name] = run(registry)
        progress(f"{name}: {report['matrices'][name]['cases']} cases, {report['matrices'][name]['violations']} violations")
    report["matrices"]["random_sequences"] = random_sequences(registry, seed, random_cases, progress)
    report["findings"] = [reproduce()[1] for reproduce in REPRODUCTIONS.values()]
    report["sources_sha256"] = source_manifest(registry)
    report["elapsed_seconds"] = round(time.perf_counter() - started, 3)
    report["cases"] = sum(item["cases"] for item in report["matrices"].values())
    report["has_failures"] = any(item["violations"] for item in report["matrices"].values()) or any(item["violation"] for item in report["findings"])
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=20261029)
    parser.add_argument("--random-cases", type=int, default=64)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--reproduce", choices=list(REPRODUCTIONS))
    args = parser.parse_args()
    if not 0 <= args.random_cases <= 10000:
        parser.error("--random-cases must be between 0 and 10000")
    if args.reproduce:
        report = REPRODUCTIONS[args.reproduce]()[1]
        failed = report["violation"]
    else:
        report = run_audit(seed=args.seed, random_cases=args.random_cases, progress=lambda message: print(message, flush=True))
        failed = report["has_failures"]
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Report: {args.report.resolve()}")
    summary = report if args.reproduce else {"cases": report["cases"], "elapsed_seconds": report["elapsed_seconds"],
        "matrices": {name: {k: v for k, v in result.items() if k != "examples"} for name, result in report["matrices"].items()},
        "findings": [{k: v for k, v in finding.items() if k != "trace"} for finding in report["findings"]]}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
