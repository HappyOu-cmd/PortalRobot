"""Emit the fixed PLC Runtime test catalog for the gateway, without PLC access."""

from __future__ import annotations

import json

from .test_scenarios import fixed_scenarios


def catalog() -> dict[str, list[dict[str, object]]]:
    return {
        suite: [
            {"index": index, "name": case["name"], "description": case["description"]}
            for index, case in enumerate(fixed_scenarios(suite), 1)
        ]
        for suite in ("smoke", "regression", "general", "geometry", "magazines")
    }


if __name__ == "__main__":
    print(json.dumps(catalog(), ensure_ascii=False))
