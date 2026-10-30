"""Emit the fixed PLC Runtime test catalog for the gateway, without PLC access."""

from __future__ import annotations

import json
import argparse

from .test_scenarios import fixed_scenarios


def catalog(mode: int = 0) -> dict[str, list[dict[str, object]]]:
    return {
        suite: [
            {"index": index, "name": case["name"], "description": case["description"]}
            for index, case in enumerate(fixed_scenarios(suite, mode), 1)
        ]
        for suite in ("acceptance", "recovery", "smoke", "regression", "general", "geometry", "magazines")
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--magazine-mode", type=int, choices=(0, 1), default=0)
    print(json.dumps(catalog(parser.parse_args().magazine_mode), ensure_ascii=False))
