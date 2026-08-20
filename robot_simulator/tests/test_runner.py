import asyncio
import json

import pytest

from robot_simulator.test_runner import GatewayRunner, RunAborted


def test_decision_oracle_uses_numeric_plc_observability() -> None:
    assert GatewayRunner.decision_matches(
        "magazine-take", {"stTestObservability.uiMagazineOperation": 2},
    )
    assert GatewayRunner.decision_matches(
        "machine-change", {"stTestObservability.auiMachineOperation[2]": 3},
    )
    assert GatewayRunner.decision_matches(
        "machine-load", {"stTestObservability.auiMachineOperation[3]": 1},
    )
    assert not GatewayRunner.decision_matches(
        "machine-unload", {"stTestObservability.auiMachineOperation[2]": 3},
    )


def test_inventory_oracle_counts_all_resource_owners() -> None:
    initial = {
        "slots": [{"content": 1, "productType": 1}] + [{"content": 0, "productType": 1}] * 119,
        "machines": [
            {"state": 3, "productType": 2},
            {"state": 1, "productType": 1},
            {"state": 0, "productType": 1},
        ],
        "grippers": [{"content": 1, "productType": 1}, {"content": 2, "productType": 3}],
    }
    assert GatewayRunner.initial_inventory(initial) == {1: 2, 2: 1, 3: 1}


def test_abort_message_interrupts_wait_so_cleanup_can_run() -> None:
    class Socket:
        async def recv(self) -> str:
            return json.dumps({"type": "test-abort-requested"})

    runner = GatewayRunner.__new__(GatewayRunner)
    runner.values = {}
    runner.environment = "simulation"
    with pytest.raises(RunAborted):
        asyncio.run(runner.wait_for(Socket(), lambda _message, _values: False, 1.0, "wait"))
