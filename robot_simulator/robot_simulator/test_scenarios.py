from __future__ import annotations

import copy
import random
from dataclasses import dataclass
from typing import Any, Iterable


EMPTY = 0
BLANK = 1
DETAIL = 2
MACHINE_DISABLED = 0
MACHINE_EMPTY_READY = 1
MACHINE_BLANK_PROCESSING = 2
MACHINE_DETAIL_READY = 3
FAULT_MASK_LIMITS = {"cell": 0x0001, "robot": 0x01FF, "magazine": 0x003F}


def _slots(*items: tuple[int, int, int]) -> list[dict[str, int]]:
    # Это снимок рабочей Zone 2: тип пустого слота используется только при загрузке теста.
    result = [{"content": EMPTY, "productType": 1} for _ in range(120)]
    for slot, content, product_type in items:
        result[slot - 1] = {"content": content, "productType": product_type}
    return result


def _distribute_slot_types(slots: list[dict[str, int]], type_count: int) -> list[dict[str, int]]:
    """Build a PLC-valid magazine colour layout without changing occupied slots."""
    result = copy.deepcopy(slots)
    if type_count <= 1:
        return result
    slot_count = len(result)
    for index, item in enumerate(result):
        if int(item["content"]) == EMPTY:
            item["productType"] = min(type_count, (index * type_count // slot_count) + 1)
    return result


def _ensure_machine_types(
    machines: Iterable[tuple[int, int]], type_count: int,
) -> list[dict[str, int]]:
    """Keep machine states but ensure every configured product type has an owner."""
    result = [
        {"state": state, "productType": max(1, min(type_count, product_type))}
        for state, product_type in machines
    ]
    counts = {
        product_type: sum(item["productType"] == product_type for item in result)
        for product_type in range(1, type_count + 1)
    }
    for missing_type in (item for item, count in counts.items() if count == 0):
        replace_index = next(
            index for index in range(len(result) - 1, -1, -1)
            if counts[result[index]["productType"]] > 1
        )
        replaced_type = result[replace_index]["productType"]
        result[replace_index]["productType"] = missing_type
        counts[replaced_type] -= 1
        counts[missing_type] += 1
    return result


def scenario(
    name: str,
    *,
    type_count: int = 1,
    machines: Iterable[tuple[int, int]] = ((MACHINE_EMPTY_READY, 1), (MACHINE_DISABLED, 0), (MACHINE_DISABLED, 0)),
    slots: list[dict[str, int]] | None = None,
    gripper_1: tuple[int, int] = (EMPTY, 0),
    gripper_2: tuple[int, int] = (EMPTY, 0),
    orientation: int = 0,
    expected: str = "cycle-completes",
    full_cycle: bool = True,
) -> dict[str, Any]:
    scenario_slots = _distribute_slot_types(
        slots if slots is not None else _slots((1, BLANK, 1)), type_count,
    )
    return {
        "schemaVersion": 1,
        "name": name,
        "description": "Встроенный сценарий автоматизированной проверки",
        "initialState": {
            "typeCount": type_count,
            "magazineEnabled": True,
            "machines": _ensure_machine_types(machines, type_count),
            "slots": scenario_slots,
            "grippers": [
                {"content": gripper_1[0], "productType": gripper_1[1]},
                {"content": gripper_2[0], "productType": gripper_2[1]},
            ],
            "orientation": orientation,
            "faultMasks": {"cell": 0, "robot": 0, "magazine": 0, "machines": [0, 0, 0]},
        },
        "expectations": {"firstDecision": expected, "fullCycle": full_cycle},
    }


def smoke_scenarios() -> list[dict[str, Any]]:
    """The ten accepted smoke cases from the project test plan."""
    return [
        scenario("Загрузить пустой станок", slots=_slots((1, BLANK, 1)), expected="magazine-take"),
        scenario("Выгрузить готовую деталь", machines=((MACHINE_DETAIL_READY, 1), (0, 0), (0, 0)), slots=_slots((1, EMPTY, 1)), expected="machine-unload"),
        scenario("Сменить деталь на заготовку", machines=((MACHINE_DETAIL_READY, 1), (0, 0), (0, 0)), slots=_slots((1, BLANK, 1), (2, EMPTY, 1)), expected="machine-change"),
        scenario("Заготовка в захвате 1 и один свободный слот", machines=((MACHINE_DETAIL_READY, 1), (0, 0), (0, 0)), slots=_slots((1, EMPTY, 1)), gripper_1=(BLANK, 1), expected="machine-change"),
        # После возврата заготовки работа в ячейке ещё потенциально существует,
        # но ни одного станка нет. Проверяем операцию и штатно запрашиваем Stop,
        # а не ошибочно ждём самостоятельного завершения всего автоцикла.
        scenario("Вернуть ненужную заготовку", machines=((MACHINE_DISABLED, 0),) * 3, slots=_slots((1, EMPTY, 1)), gripper_1=(BLANK, 1), orientation=1, expected="return-blank", full_cycle=False),
        scenario("Готовая деталь в захвате 2", slots=_slots((1, EMPTY, 1)), gripper_2=(DETAIL, 1), orientation=1, expected="magazine-put"),
        scenario("Два типа и запрос оператора", type_count=2, machines=((1, 1), (1, 2), (0, 1)), slots=_slots((1, EMPTY, 1)), gripper_1=(BLANK, 2), expected="operator-type-choice", full_cycle=False),
        scenario("Три типа и совместимый станок", type_count=3, machines=((1, 1), (1, 2), (1, 3)), slots=_slots((1, EMPTY, 1)), gripper_1=(BLANK, 3), expected="operator-type-choice", full_cycle=False),
        scenario("Штатный Stop в безопасной точке", slots=_slots((1, BLANK, 1)), expected="safe-stop", full_cycle=False),
        scenario("Авария робота и Reset", slots=_slots((1, BLANK, 1)), expected="robot-error-reset", full_cycle=False),
    ]


def validate_inventory(initial_state: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    type_count = int(initial_state.get("typeCount", 0))
    if type_count not in (1, 2, 3):
        errors.append("typeCount must be 1..3")
    slots = initial_state.get("slots", [])
    if len(slots) != 120:
        errors.append("exactly 120 slots are required")
    for index, item in enumerate(slots, 1):
        content = int(item.get("content", -1))
        product_type = int(item.get("productType", -1))
        if content not in (EMPTY, BLANK, DETAIL):
            errors.append(f"slot {index}: invalid content")
        if product_type not in range(1, type_count + 1):
            errors.append(f"slot {index}: invalid configured type")
    machines = initial_state.get("machines", [])
    if len(machines) != 3:
        errors.append("exactly 3 machines are required")
    for index, item in enumerate(machines, 1):
        if int(item.get("state", -1)) not in range(0, 4):
            errors.append(f"machine {index}: invalid state")
        if int(item.get("productType", -1)) not in range(1, type_count + 1):
            errors.append(f"machine {index}: invalid configured type")
    grippers = initial_state.get("grippers", [])
    if len(grippers) != 2:
        errors.append("exactly 2 grippers are required")
    for index, item in enumerate(grippers, 1):
        content = int(item.get("content", -1))
        product_type = int(item.get("productType", -1))
        if (index == 1 and content not in (EMPTY, BLANK)) or (index == 2 and content not in (EMPTY, DETAIL)):
            errors.append(f"gripper {index}: invalid payload kind")
        if content == EMPTY and product_type != 0:
            errors.append(f"gripper {index}: empty payload must have type 0")
        if content != EMPTY and product_type not in range(1, type_count + 1):
            errors.append(f"gripper {index}: invalid payload type")
    if type_count in (1, 2, 3):
        machine_types = {int(item.get("productType", 0)) for item in machines}
        slot_types = {int(item.get("productType", 0)) for item in slots}
        for product_type in range(1, type_count + 1):
            if product_type not in machine_types:
                errors.append(f"product type {product_type}: no assigned machine")
            if product_type not in slot_types:
                errors.append(f"product type {product_type}: no assigned magazine slot")
    masks = initial_state.get("faultMasks", {})
    owner_count = 0
    for owner, limit in FAULT_MASK_LIMITS.items():
        value = int(masks.get(owner, 0))
        if value < 0 or value > limit:
            errors.append(f"{owner} fault mask is outside 0..0x{limit:04X}")
        if value:
            owner_count += 1
    machine_masks = masks.get("machines", [])
    if len(machine_masks) != 3:
        errors.append("exactly 3 machine fault masks are required")
    else:
        for index, raw_value in enumerate(machine_masks, 1):
            value = int(raw_value)
            if value < 0 or value > 0x07FF:
                errors.append(f"machine {index} fault mask is outside 0..0x07FF")
            if value:
                owner_count += 1
    if owner_count > 1:
        errors.append("initial fault masks must have one primary owner")
    return errors


def expected_error_owner(initial_state: dict[str, Any]) -> int:
    masks = initial_state.get("faultMasks", {})
    owners = []
    if int(masks.get("cell", 0)):
        owners.append(1)
    if int(masks.get("robot", 0)):
        owners.append(2)
    if int(masks.get("magazine", 0)):
        owners.append(3)
    owners.extend(index + 3 for index, value in enumerate(masks.get("machines", []), 1) if int(value))
    return owners[0] if len(owners) == 1 else 0


def expected_first_decision(initial_state: dict[str, Any]) -> str:
    grippers = initial_state["grippers"]
    if grippers[0]["content"] == BLANK:
        blank_type = int(grippers[0]["productType"])
        if grippers[1]["content"] == DETAIL:
            return "machine-load"
        compatible = [
            machine for machine in initial_state["machines"]
            if int(machine["state"]) != MACHINE_DISABLED
            and int(machine["productType"]) == blank_type
        ]
        ready = next(
            (
                machine for machine in compatible
                if int(machine["state"]) in (MACHINE_EMPTY_READY, MACHINE_DETAIL_READY)
            ),
            None,
        )
        if ready is not None:
            return (
                "machine-load"
                if int(ready["state"]) == MACHINE_EMPTY_READY
                else "machine-change"
            )
        if any(int(machine["state"]) == MACHINE_BLANK_PROCESSING for machine in compatible):
            return "machine-change"
        return "return-blank"
    if grippers[1]["content"] == DETAIL:
        return "magazine-put"

    blank_types = {
        int(slot["productType"])
        for slot in initial_state["slots"]
        if int(slot["content"]) == BLANK
    }
    free_types = {
        int(slot["productType"])
        for slot in initial_state["slots"]
        if int(slot["content"]) == EMPTY
    }
    enabled = [
        machine for machine in initial_state["machines"]
        if int(machine["state"]) != MACHINE_DISABLED
    ]

    # SelectMachineBeforeTake walks ready machines in index order. Therefore an
    # empty compatible machine can legitimately be selected before a later
    # machine with a finished detail.
    immediate = next(
        (
            machine for machine in enabled
            if int(machine["productType"]) in blank_types
            and int(machine["state"]) in (MACHINE_EMPTY_READY, MACHINE_DETAIL_READY)
        ),
        None,
    )
    if immediate is not None:
        return (
            "machine-load"
            if int(immediate["state"]) == MACHINE_EMPTY_READY
            else "machine-change"
        )
    if any(
        int(machine["state"]) == MACHINE_BLANK_PROCESSING
        and int(machine["productType"]) in blank_types
        for machine in enabled
    ):
        return "machine-change"
    if any(
        int(machine["state"]) in (MACHINE_BLANK_PROCESSING, MACHINE_DETAIL_READY)
        and int(machine["productType"]) in free_types
        for machine in enabled
    ):
        return "machine-unload"
    return "no-task"


def generated_scenarios(seed: int, count: int) -> list[dict[str, Any]]:
    randomizer = random.Random(seed)
    result: list[dict[str, Any]] = []
    full_cycle_target = min(20, max(1, count // 10))
    full_cycle_assigned = 0
    for index in range(max(1, min(1000, count))):
        type_count = randomizer.randint(1, 3)
        machines = []
        for _ in range(3):
            state = randomizer.choice((MACHINE_DISABLED, MACHINE_EMPTY_READY, MACHINE_BLANK_PROCESSING, MACHINE_DETAIL_READY))
            machines.append((state, randomizer.randint(1, type_count)))
        slot_values = _slots()
        for slot in range(randomizer.randint(1, 12)):
            content = randomizer.choice((EMPTY, BLANK, DETAIL))
            slot_values[slot] = {"content": content, "productType": randomizer.randint(1, type_count)}
        gripper_1 = (BLANK, randomizer.randint(1, type_count)) if randomizer.random() < 0.30 else (EMPTY, 0)
        gripper_2 = (DETAIL, randomizer.randint(1, type_count)) if randomizer.random() < 0.30 else (EMPTY, 0)
        if gripper_1[0] and gripper_2[0]:
            # The PLC asks for a compatible starting machine when both payloads are present.
            machines[0] = (MACHINE_EMPTY_READY, gripper_1[1])
        rejected = (index + 1) % 10 == 0
        run_full_cycle = not rejected and full_cycle_assigned < full_cycle_target
        if run_full_cycle:
            full_cycle_assigned += 1
        item = scenario(
            f"Generated {seed}-{index + 1}", type_count=type_count, machines=machines,
            slots=slot_values, gripper_1=gripper_1, gripper_2=gripper_2,
            orientation=randomizer.randint(0, 1), full_cycle=run_full_cycle,
        )
        item["expectations"]["firstDecision"] = expected_first_decision(item["initialState"])
        if rejected:
            item["initialState"]["slots"][-1]["productType"] = 0
            item["expectations"] = {
                "firstDecision": "scenario-rejected", "fullCycle": False, "applyRejected": True,
            }
        result.append(item)
    return result


def error_owner_scenarios() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    definitions = [
        ("Cell fault owner", {"cell": 1, "robot": 0, "magazine": 0, "machines": [0, 0, 0]}, 1),
        ("Robot fault owner", {"cell": 0, "robot": 1, "magazine": 0, "machines": [0, 0, 0]}, 2),
        ("Magazine fault owner", {"cell": 0, "robot": 0, "magazine": 1, "machines": [0, 0, 0]}, 3),
        ("Machine 1 fault owner", {"cell": 0, "robot": 0, "magazine": 0, "machines": [1, 0, 0]}, 4),
        ("Machine 2 fault owner", {"cell": 0, "robot": 0, "magazine": 0, "machines": [0, 1, 0]}, 5),
        ("Machine 3 fault owner", {"cell": 0, "robot": 0, "magazine": 0, "machines": [0, 0, 1]}, 6),
    ]
    for name, masks, source in definitions:
        machines = [(MACHINE_EMPTY_READY, 1), (MACHINE_DISABLED, 1), (MACHINE_DISABLED, 1)]
        if source in (5, 6):
            target = source - 3
            machines[0] = (MACHINE_DISABLED, 1)
            machines[target - 1] = (MACHINE_EMPTY_READY, 1)
        item = scenario(
            name,
            machines=machines,
            full_cycle=False,
            expected="initial-error",
        )
        item["initialState"]["faultMasks"] = masks
        item["expectations"]["expectedErrorSource"] = source
        cases.append(item)
    return cases


def operator_cancel_scenario() -> dict[str, Any]:
    item = scenario(
        "Operator cancels prestart identification",
        type_count=2,
        machines=((MACHINE_EMPTY_READY, 1), (MACHINE_EMPTY_READY, 2), (MACHINE_DISABLED, 1)),
        slots=_slots((1, EMPTY, 1)),
        gripper_1=(BLANK, 2),
        expected="operator-type-choice",
        full_cycle=False,
    )
    item["expectations"]["testKind"] = "operator-cancel"
    return item


def regression_scenarios() -> list[dict[str, Any]]:
    return smoke_scenarios() + error_owner_scenarios() + [operator_cancel_scenario()] + generated_scenarios(50_100, 53)
