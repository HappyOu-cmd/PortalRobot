from robot_simulator.test_scenarios import (
    error_owner_scenarios,
    expected_error_owner,
    expected_first_decision,
    generated_scenarios,
    operator_cancel_scenario,
    regression_scenarios,
    smoke_scenarios,
    validate_inventory,
)


def test_smoke_suite_has_ten_valid_cases() -> None:
    cases = smoke_scenarios()
    assert len(cases) == 10
    assert all(not validate_inventory(case["initialState"]) for case in cases)


def test_generator_is_reproducible() -> None:
    assert generated_scenarios(123, 25) == generated_scenarios(123, 25)
    assert generated_scenarios(123, 25) != generated_scenarios(124, 25)


def test_generator_has_fixed_opc_buffer_shape() -> None:
    cases = generated_scenarios(7, 100)
    for case in cases:
        assert len(case["initialState"]["slots"]) == 120
        assert len(case["initialState"]["machines"]) == 3
        assert len(case["initialState"]["grippers"]) == 2
        if case["expectations"].get("applyRejected"):
            assert validate_inventory(case["initialState"])
        else:
            assert not validate_inventory(case["initialState"])
    assert sum(bool(case["expectations"].get("applyRejected")) for case in cases) == 10
    assert any(case["initialState"]["grippers"][0]["content"] for case in cases)
    assert any(case["initialState"]["grippers"][1]["content"] for case in cases)
    assert any(all(item["content"] for item in case["initialState"]["grippers"]) for case in cases)


def test_generator_limits_full_cycles_to_ten_percent_and_twenty() -> None:
    assert sum(bool(case["expectations"].get("fullCycle")) for case in generated_scenarios(7, 100)) == 10
    assert sum(bool(case["expectations"].get("fullCycle")) for case in generated_scenarios(7, 1000)) == 20


def test_operator_smoke_cases_have_a_payload_to_identify() -> None:
    cases = [case for case in smoke_scenarios() if case["expectations"]["firstDecision"] == "operator-type-choice"]
    assert len(cases) == 2
    assert all(case["initialState"]["grippers"][0]["content"] == 1 for case in cases)


def test_multitype_smoke_cases_assign_every_type_to_machine_and_magazine() -> None:
    for case in smoke_scenarios():
        state = case["initialState"]
        expected_types = set(range(1, state["typeCount"] + 1))
        assert expected_types <= {item["productType"] for item in state["machines"]}
        assert expected_types <= {item["productType"] for item in state["slots"]}


def test_first_decision_oracle_routes_known_payloads_after_operator_identification() -> None:
    held_blank = smoke_scenarios()[6]["initialState"]
    held_detail = smoke_scenarios()[5]["initialState"]
    assert expected_first_decision(held_blank) == "machine-load"
    assert expected_first_decision(held_detail) == "magazine-put"


def test_first_decision_oracle_uses_first_compatible_ready_machine() -> None:
    item = generated_scenarios(50_100, 18)[17]
    assert [machine["state"] for machine in item["initialState"]["machines"]] == [0, 1, 3]
    assert expected_first_decision(item["initialState"]) == "machine-load"


def test_first_decision_oracle_reports_no_task_without_enabled_machine() -> None:
    item = generated_scenarios(50_100, 45)[44]
    assert all(machine["state"] == 0 for machine in item["initialState"]["machines"])
    assert expected_first_decision(item["initialState"]) == "no-task"


def test_return_blank_smoke_case_checks_decision_without_waiting_for_an_impossible_empty_cell() -> None:
    item = smoke_scenarios()[4]
    assert item["expectations"]["firstDecision"] == "return-blank"
    assert item["expectations"]["fullCycle"] is False


def test_regression_suite_has_fixed_owner_cases_and_seventy_total() -> None:
    owners = error_owner_scenarios()
    assert [case["expectations"]["expectedErrorSource"] for case in owners] == [1, 2, 3, 4, 5, 6]
    assert owners[4]["initialState"]["machines"][1]["state"] == 1
    assert owners[5]["initialState"]["machines"][2]["state"] == 1
    assert len(regression_scenarios()) == 70
    assert operator_cancel_scenario()["expectations"]["testKind"] == "operator-cancel"


def test_initial_fault_mask_has_one_inferred_primary_owner() -> None:
    item = smoke_scenarios()[0]
    item["initialState"]["faultMasks"]["machines"][1] = 0x0002
    assert expected_error_owner(item["initialState"]) == 5
    assert not validate_inventory(item["initialState"])
    item["initialState"]["faultMasks"]["robot"] = 1
    assert expected_error_owner(item["initialState"]) == 0
    assert "initial fault masks must have one primary owner" in validate_inventory(item["initialState"])
