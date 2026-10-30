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
FAULT_MASK_LIMITS = {"cell": 0x0001, "robot": 0x01FF}
MAGAZINE_COUNT = 2


def _slots(*items: tuple[int, int, int]) -> list[dict[str, int]]:
    # Снимок статичной кассеты: тип пустого слота используется при загрузке теста.
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
    description: str = "Встроенный сценарий автоматизированной проверки",
    type_count: int = 1,
    machines: Iterable[tuple[int, int]] = ((MACHINE_EMPTY_READY, 1), (MACHINE_DISABLED, 0), (MACHINE_DISABLED, 0)),
    slots: list[dict[str, int]] | None = None,
    magazine_2_slots: list[dict[str, int]] | None = None,
    magazine_enabled: tuple[bool, bool] = (True, False),
    gripper_1: tuple[int, int] = (EMPTY, 0),
    gripper_2: tuple[int, int] = (EMPTY, 0),
    orientation: int = 0,
    expected: str = "cycle-completes",
    expected_magazine: int | None = None,
    full_cycle: bool = True,
) -> dict[str, Any]:
    magazine_1_slots = _distribute_slot_types(
        slots if slots is not None else _slots((1, BLANK, 1)), type_count,
    )
    magazine_2_state = _distribute_slot_types(
        magazine_2_slots if magazine_2_slots is not None else _slots(), type_count,
    )
    for index, item in enumerate(magazine_2_state):
        item["productType"] = magazine_1_slots[index]["productType"]
    expectations: dict[str, Any] = {"firstDecision": expected, "fullCycle": full_cycle}
    if expected_magazine is not None:
        expectations["expectedMagazine"] = expected_magazine
    return {
        "schemaVersion": 3,
        "name": name,
        "description": description,
        "initialState": {
            "typeCount": type_count,
            "magazineMode": 0,
            "geometry": {"enabled": [False, False], "calls": [False, False, False], "waitWhenOccupied": True},
            "machines": _ensure_machine_types(machines, type_count),
            "magazines": [
                {"enabled": bool(magazine_enabled[0]), "slots": magazine_1_slots},
                {"enabled": bool(magazine_enabled[1]), "slots": magazine_2_state},
            ],
            "grippers": [
                {"content": gripper_1[0], "productType": gripper_1[1]},
                {"content": gripper_2[0], "productType": gripper_2[1]},
            ],
            "orientation": orientation,
            "faultMasks": {"cell": 0, "robot": 0, "magazines": [0, 0], "machines": [0, 0, 0]},
        },
        "expectations": expectations,
    }


def smoke_scenarios() -> list[dict[str, Any]]:
    """The twelve base smoke cases, shared by both magazine layouts."""
    return [
        scenario("Загрузить пустой станок", slots=_slots((1, BLANK, 1)), expected="magazine-take"),
        scenario("Выгрузить готовую деталь", machines=((MACHINE_DETAIL_READY, 1), (0, 0), (0, 0)), slots=_slots((1, EMPTY, 1)), expected="machine-unload"),
        scenario("Сменить деталь на заготовку", machines=((MACHINE_DETAIL_READY, 1), (0, 0), (0, 0)), slots=_slots((1, BLANK, 1), (2, EMPTY, 1)), expected="machine-change"),
        scenario("Заготовка в захвате 1 и один свободный слот", machines=((MACHINE_DETAIL_READY, 1), (0, 0), (0, 0)), slots=_slots((1, EMPTY, 1)), gripper_1=(BLANK, 1), expected="machine-change"),
        # После возврата заготовки работа в ячейке ещё потенциально существует,
        # но ни одного станка нет. Проверяем операцию и штатно запрашиваем Stop,
        # а не ошибочно ждём самостоятельного завершения всего автоцикла.
        scenario("Ждать с заготовкой одного типа", machines=((MACHINE_DISABLED, 0),) * 3, slots=_slots((1, EMPTY, 1)), gripper_1=(BLANK, 1), orientation=1, expected="held-blank-wait", full_cycle=False),
        scenario("Готовая деталь в захвате 2", slots=_slots((1, EMPTY, 1)), gripper_2=(DETAIL, 1), orientation=1, expected="magazine-put"),
        scenario("Два типа и запрос оператора", type_count=2, machines=((1, 1), (1, 2), (0, 1)), slots=_slots((1, EMPTY, 1)), gripper_1=(BLANK, 2), expected="operator-type-choice", full_cycle=False),
        scenario("Три типа и совместимый станок", type_count=3, machines=((1, 1), (1, 2), (1, 3)), slots=_slots((1, EMPTY, 1)), gripper_1=(BLANK, 3), expected="operator-type-choice", full_cycle=False),
        scenario("Штатный Stop в безопасной точке", slots=_slots((1, BLANK, 1)), expected="safe-stop", full_cycle=False),
        scenario("Авария робота и Reset", slots=_slots((1, BLANK, 1)), expected="robot-error-reset", full_cycle=False),
        scenario(
            "Загрузить станок из магазина 2",
            slots=_slots(),
            magazine_2_slots=_slots((1, BLANK, 1)),
            magazine_enabled=(False, True),
            expected="magazine-take",
            expected_magazine=2,
        ),
        scenario(
            "Уложить готовую деталь в магазин 2",
            slots=_slots(),
            magazine_2_slots=_slots((1, EMPTY, 1)),
            magazine_enabled=(False, True),
            gripper_2=(DETAIL, 1),
            orientation=1,
            expected="magazine-put",
            expected_magazine=2,
            full_cycle=False,
        ),
    ]


def validate_inventory(initial_state: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    type_count = int(initial_state.get("typeCount", 0))
    if type_count not in (1, 2, 3):
        errors.append("typeCount must be 1..3")
    if initial_state.get("orientation", 0) not in (0, 1):
        errors.append("orientation must be 0 or 1")
    mode = initial_state.get("magazineMode", 0)
    if mode not in (0, 1):
        errors.append("unknown magazineMode")
    slot_count = 96 if mode == 1 else 120
    magazines = initial_state.get("magazines", [])
    if len(magazines) != MAGAZINE_COUNT:
        errors.append("exactly 2 magazines are required")
    for magazine_index, magazine in enumerate(magazines, 1):
        slots = magazine.get("slots", [])
        if len(slots) != slot_count:
            errors.append(f"magazine {magazine_index}: exactly {slot_count} slots are required")
        if mode == 1:
            other = magazine.get("operatorSlots", [])
            if len(other) != slot_count:
                errors.append(f"magazine {magazine_index}: exactly 96 operator slots are required")
            for index, item in enumerate(other):
                if item.get("content") not in (EMPTY, BLANK, DETAIL):
                    errors.append(f"operator pallet {magazine_index} slot {index + 1}: invalid content")
                if index < len(slots) and item.get("productType") != slots[index].get("productType"):
                    errors.append(f"operator pallet {magazine_index} slot {index + 1}: configured type mismatch")
        for index, item in enumerate(slots, 1):
            content = int(item.get("content", -1))
            product_type = int(item.get("productType", -1))
            if content not in (EMPTY, BLANK, DETAIL):
                errors.append(f"magazine {magazine_index} slot {index}: invalid content")
            if product_type not in range(1, type_count + 1):
                errors.append(f"magazine {magazine_index} slot {index}: invalid configured type")
    if len(magazines) == MAGAZINE_COUNT and all(len(item.get("slots", [])) == slot_count for item in magazines):
        for index, (first, second) in enumerate(zip(magazines[0]["slots"], magazines[1]["slots"]), 1):
            if int(first.get("productType", -1)) != int(second.get("productType", -1)):
                errors.append(f"slot {index}: configured type must match in both magazines")
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
        slot_types = {
            int(item.get("productType", 0))
            for magazine in magazines
            for item in magazine.get("slots", [])
        }
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
    magazine_masks = masks.get("magazines", [])
    if len(magazine_masks) != MAGAZINE_COUNT:
        errors.append("exactly 2 magazine fault masks are required")
    else:
        for index, raw_value in enumerate(magazine_masks, 1):
            value = int(raw_value)
            if value < 0 or value > 0x003F:
                errors.append(f"magazine {index} fault mask is outside 0..0x003F")
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
    magazine_masks = masks.get("magazines", [])
    if len(magazine_masks) > 0 and int(magazine_masks[0]):
        owners.append(3)
    owners.extend(index + 3 for index, value in enumerate(masks.get("machines", []), 1) if int(value))
    if len(magazine_masks) > 1 and int(magazine_masks[1]):
        owners.append(7)
    return owners[0] if len(owners) == 1 else 0


def _can_return_held_blank(initial_state: dict[str, Any], blank_type: int) -> bool:
    if int(initial_state["typeCount"]) <= 1:
        return False
    faults = initial_state.get("faultMasks", {})
    magazine_faults = faults.get("magazines", [0, 0])
    machine_faults = faults.get("machines", [0, 0, 0])
    available = [
        (index, magazine)
        for index, magazine in enumerate(initial_state["magazines"])
        if bool(magazine.get("enabled", False)) and not magazine_faults[index]
    ]
    if not available:
        return False
    return_magazine, return_inventory = available[0]
    if not any(int(slot["content"]) == EMPTY for slot in return_inventory["slots"]):
        return False
    for index, magazine in available:
        blank_types = {
            int(slot["productType"])
            for slot in magazine["slots"] if int(slot["content"]) == BLANK
        }
        free_count = sum(int(slot["content"]) == EMPTY for slot in magazine["slots"])
        for machine_index, machine in enumerate(initial_state["machines"]):
            state = int(machine["state"])
            product_type = int(machine["productType"])
            if machine_faults[machine_index] or product_type == blank_type:
                continue
            if state in (MACHINE_EMPTY_READY, MACHINE_BLANK_PROCESSING, MACHINE_DETAIL_READY):
                if product_type in blank_types:
                    return True
            if state == MACHINE_DETAIL_READY and free_count > int(index == return_magazine):
                return True
    return False


def expected_first_decision(initial_state: dict[str, Any]) -> str:
    grippers = initial_state["grippers"]
    if grippers[0]["content"] == BLANK:
        blank_type = int(grippers[0]["productType"])
        if grippers[1]["content"] == DETAIL:
            immediate_load = any(
                int(machine["state"]) == MACHINE_EMPTY_READY
                and int(machine["productType"]) == blank_type
                for machine in initial_state["machines"]
            )
            return "machine-load" if immediate_load else "magazine-put"
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
        return "return-blank" if _can_return_held_blank(initial_state, blank_type) else "held-blank-wait"
    if grippers[1]["content"] == DETAIL:
        return "magazine-put"

    masks = initial_state.get("faultMasks", {})
    magazine_faults = masks.get("magazines", [0, 0])
    machine_faults = masks.get("machines", [0, 0, 0])
    available = [m for i, m in enumerate(initial_state["magazines"])
                 if m.get("enabled") and not magazine_faults[i]]
    enabled = [m for i, m in enumerate(initial_state["machines"])
               if int(m["state"]) != MACHINE_DISABLED and not machine_faults[i]]
    for magazine in available:
        blank_types = {int(s["productType"]) for s in magazine["slots"] if s["content"] == BLANK}
        immediate = next((m for m in enabled if m["productType"] in blank_types
                          and m["state"] in (MACHINE_EMPTY_READY, MACHINE_DETAIL_READY)), None)
        if immediate:
            return "machine-load" if immediate["state"] == MACHINE_EMPTY_READY else "machine-change"
        if any(m["state"] == MACHINE_BLANK_PROCESSING and m["productType"] in blank_types for m in enabled):
            return "machine-change"
    if any(any(s["content"] == EMPTY for s in m["slots"]) for m in available) and any(
            m["state"] in (MACHINE_BLANK_PROCESSING, MACHINE_DETAIL_READY) for m in enabled):
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
        item = scenario(
            f"Generated {seed}-{index + 1}", type_count=type_count, machines=machines,
            slots=slot_values, gripper_1=gripper_1, gripper_2=gripper_2,
            orientation=randomizer.randint(0, 1), full_cycle=False,
        )
        item["expectations"]["firstDecision"] = expected_first_decision(item["initialState"])
        if (not rejected and item["expectations"]["firstDecision"] != "held-blank-wait"
                and full_cycle_assigned < full_cycle_target):
            item["expectations"]["fullCycle"] = True
            full_cycle_assigned += 1
        if rejected:
            # Тип слота является общей конфигурацией двух магазинов. Оставляем
            # одинаковое намеренно неверное значение в обоих снимках, чтобы
            # gateway пропустил буфер до PLC, а проверялась именно PLC-валидация
            # диапазона типа, а не транспортный контракт JSON.
            for magazine in item["initialState"]["magazines"]:
                magazine["slots"][-1]["productType"] = 0
            item["expectations"] = {
                "firstDecision": "scenario-rejected", "fullCycle": False, "applyRejected": True,
            }
        result.append(item)
    return result


def error_owner_scenarios() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    definitions = [
        ("Cell fault owner", {"cell": 1, "robot": 0, "magazines": [0, 0], "machines": [0, 0, 0]}, 1),
        ("Robot fault owner", {"cell": 0, "robot": 1, "magazines": [0, 0], "machines": [0, 0, 0]}, 2),
        ("Magazine 1 fault owner", {"cell": 0, "robot": 0, "magazines": [1, 0], "machines": [0, 0, 0]}, 3),
        ("Magazine 2 fault owner", {"cell": 0, "robot": 0, "magazines": [0, 1], "machines": [0, 0, 0]}, 7),
        ("Machine 1 fault owner", {"cell": 0, "robot": 0, "magazines": [0, 0], "machines": [1, 0, 0]}, 4),
        ("Machine 2 fault owner", {"cell": 0, "robot": 0, "magazines": [0, 0], "machines": [0, 1, 0]}, 5),
        ("Machine 3 fault owner", {"cell": 0, "robot": 0, "magazines": [0, 0], "machines": [0, 0, 1]}, 6),
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
            magazine_enabled=(False, True) if source == 7 else (True, False),
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


def payload_recovery_scenarios() -> list[dict[str, Any]]:
    """Recovery routes for a robot holding both a blank and a finished detail."""
    almost_full = _slots(*(
        (slot, BLANK, 1) for slot in range(1, 120)
    ))
    load_first = scenario(
        "Два груза после перезаполнения магазина — сначала загрузить станок",
        machines=(
            (MACHINE_DETAIL_READY, 1),
            (MACHINE_DETAIL_READY, 1),
            (MACHINE_EMPTY_READY, 1),
        ),
        slots=copy.deepcopy(almost_full),
        magazine_enabled=(False, False),
        gripper_1=(BLANK, 1),
        gripper_2=(DETAIL, 1),
        expected="machine-load",
        expected_magazine=1,
        full_cycle=False,
    )
    load_first["expectations"]["enableMagazineBeforeStart"] = 1

    put_first = scenario(
        "Два груза без пустого станка — сначала уложить деталь",
        machines=(
            (MACHINE_BLANK_PROCESSING, 1),
            (MACHINE_BLANK_PROCESSING, 1),
            (MACHINE_DISABLED, 1),
        ),
        slots=copy.deepcopy(almost_full),
        gripper_1=(BLANK, 1),
        gripper_2=(DETAIL, 1),
        expected="magazine-put",
        full_cycle=False,
    )
    return [load_first, put_first]


def general_scenarios() -> list[dict[str, Any]]:
    """Four full magazine batches for every occupancy mask of three machines."""
    definitions = (
        ("Все три станка загружены", (True, True, True)),
        ("Все три станка пустые", (False, False, False)),
        ("Загружен только станок 1", (True, False, False)),
        ("Загружен только станок 2", (False, True, False)),
        ("Загружен только станок 3", (False, False, True)),
        ("Загружены станки 1 и 2", (True, True, False)),
        ("Загружены станки 1 и 3", (True, False, True)),
        ("Загружены станки 2 и 3", (False, True, True)),
    )
    full_blanks = _slots(*(
        (slot, BLANK, 1) for slot in range(1, 121)
    ))
    result: list[dict[str, Any]] = []
    for label, loaded in definitions:
        machines = tuple(
            (MACHINE_DETAIL_READY if has_detail else MACHINE_EMPTY_READY, 1)
            for has_detail in loaded
        )
        item = scenario(
            f"Генеральный цикл — {label}",
            description=(
                "Четыре полные партии одного типа: М1-A → М2-A → М1-B → М2-B; "
                "неактивный магазин перезагружается штатными командами."
            ),
            machines=machines,
            slots=copy.deepcopy(full_blanks),
            magazine_2_slots=copy.deepcopy(full_blanks),
            magazine_enabled=(True, True),
            full_cycle=False,
        )
        item["expectations"]["firstDecision"] = expected_first_decision(item["initialState"])
        item["expectations"].update({
            "testKind": "general-four-batches",
            "initialLoadedMachineCount": sum(loaded),
            "batchSize": 120,
            "expectedMagazineSequence": [1, 2, 1, 2],
        })
        result.append(item)
    return result


def regression_scenarios() -> list[dict[str, Any]]:
    return (
        smoke_scenarios()
        + error_owner_scenarios()
        + [operator_cancel_scenario()]
        + generated_scenarios(50_100, 53)
        + payload_recovery_scenarios()
    )


def fixed_scenarios(suite: str) -> list[dict[str, Any]]:
    """Single source for the runner and the HMI catalog's fixed case order."""
    factories = {
        "smoke": smoke_scenarios,
        "regression": regression_scenarios,
        "general": general_scenarios,
        "geometry": geometry_scenarios,
        "magazines": magazine_scenarios,
    }
    try:
        return factories[suite]()
    except KeyError as error:
        raise ValueError(f"Неизвестный фиксированный набор тестов: {suite}") from error


def for_magazine_mode(case: dict[str, Any], mode: int) -> dict[str, Any]:
    """Adapt the fixed scenario's semantic robot/operator sides, without changing PLC mode."""
    result = copy.deepcopy(case)
    result["schemaVersion"] = 3
    state = result["initialState"]
    state["magazineMode"] = mode
    state.setdefault("geometry", {"enabled": [False, False], "calls": [False] * 3, "waitWhenOccupied": True})
    if mode == 1:
        for magazine in state["magazines"]:
            # Keep the intentional invalid tail in a generated rejection case.
            tail = magazine["slots"][-1]
            magazine["slots"] = magazine["slots"][:96]
            if result["expectations"].get("applyRejected"):
                magazine["slots"][-1] = copy.deepcopy(tail)
            magazine.setdefault("operatorSlots", [{"content": 0, "productType": slot["productType"]}
                                                  for slot in magazine["slots"]])
            magazine.setdefault("operatorLoaded", False)
            magazine.setdefault("autoSwap", False)
    elif mode != 0:
        raise ValueError("unknown magazineMode")
    return result


def geometry_scenarios() -> list[dict[str, Any]]:
    definitions = [
        ("ГК 1 — вызов готовой детали", [True, False], [True, False, False], [True, False], True, {"1": 4}, {"1": 1}),
        ("ГК 2 — вызов готовой детали", [False, True], [True, False, False], [True, False], True, {"1": 4}, {"1": 2}),
        ("ГК — доставка при выключенных магазинах", [True, False], [True, False, False], [False, False], True, {"1": 4}, {"1": 1}),
        ("ГК — два вызова на разные станции", [True, True], [True, True, False], [True, True], True, {"1": 4, "2": 4}, {}),
        ("ГК — третий вызов ждёт свободную станцию", [True, True], [True, True, True], [True, True], True, {"1": 4, "2": 4, "3": 1}, {}),
        ("ГК — обход занятых станций в магазин", [True, True], [True, True, True], [True, True], False, {"1": 4, "2": 4, "3": 5}, {}),
        ("ГК — вызов со станка 3", [True, False], [False, False, True], [True, False], True, {"3": 4}, {"3": 1}),
        ("ГК — обычная деталь без вызова идёт в магазин", [True, True], [False] * 3, [True, False], True, {}, {}),
    ]
    result = []
    for name, stations, calls, magazines, wait, call_states, destinations in definitions:
        machines = tuple((MACHINE_DETAIL_READY if (calls[i] or (not any(calls) and i == 0)) else MACHINE_DISABLED, 1) for i in range(3))
        item = scenario(name, description="Подтверждение маршрута, состояний вызовов и баланса деталей; без автоматического изъятия с ГК.",
                        machines=machines, slots=_slots(), magazine_enabled=tuple(magazines),
                        expected="geometry-delivery" if call_states else "machine-unload", full_cycle=False)
        item["initialState"]["geometry"] = {"enabled": stations, "calls": calls, "waitWhenOccupied": wait}
        item["expectations"].update({"testKind": "geometry-route", "callStates": call_states, "destinations": destinations})
        result.append(item)
    return result


def magazine_scenarios() -> list[dict[str, Any]]:
    base = [
        scenario("Палеты — подача из магазина 1", expected="magazine-take", expected_magazine=1, full_cycle=False),
        scenario("Палеты — подача из магазина 2", slots=_slots(), magazine_2_slots=_slots((1, BLANK, 1)),
                 magazine_enabled=(False, True), expected="magazine-take", expected_magazine=2, full_cycle=False),
        scenario("Палеты — второй магазин при пустом первом", slots=_slots(), magazine_2_slots=_slots((1, BLANK, 1)),
                 magazine_enabled=(True, True), expected="magazine-take", expected_magazine=2, full_cycle=False),
        scenario("Палеты — CHANGE в одном слоте полной палеты", slots=_slots(*((i, BLANK, 1) for i in range(1, 121))),
                 machines=((2, 1), (0, 1), (0, 1)), gripper_2=(DETAIL, 1), expected="magazine-change", expected_magazine=1, full_cycle=False),
        scenario("Палеты — возврат в свой магазин", magazine_enabled=(True, True), expected="magazine-take", expected_magazine=1, full_cycle=False),
        scenario("Палеты — операторский запас без автообмена", slots=_slots(), expected="no-task", full_cycle=False),
        scenario("Палеты — неподтверждённая загрузка не подаётся", slots=_slots(), expected="no-task", full_cycle=False),
        scenario("Палеты — автоматический обмен подтверждённой загрузки", slots=_slots(), expected="pallet-swap", full_cycle=False),
    ]
    result = [for_magazine_mode(item, 1) for item in base]
    result[4]["expectations"]["returnMagazine"] = 1
    for index in (5, 6, 7):
        magazine = result[index]["initialState"]["magazines"][0]
        magazine["operatorSlots"][0]["content"] = BLANK
        magazine["operatorLoaded"] = index != 6
        magazine["autoSwap"] = index != 5
    result[7]["expectations"]["testKind"] = "pallet-swap"
    return result
