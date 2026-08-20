from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    "server": {
        "host": "0.0.0.0",
        "port": 502,
        "unit_id": 1,
        "plc_heartbeat_timeout_s": 2.0,
        "robot_heartbeat_period_s": 0.1,
        "simulation_period_s": 0.02,
    },
    "control_api": {
        "host": "127.0.0.1",
        "port": 8765,
        "lease_timeout_s": 15.0,
    },
    "motion": {
        "speed_mm_s": 1000.0,
        "acceleration_mm_s2": 1000.0,
        "deceleration_mm_s2": 1000.0,
        "jerk_mm_s3": 10000.0,
    },
    "gripper": {
        "gripper_1_open_s": 1.0,
        "gripper_1_close_s": 1.0,
        "gripper_2_open_s": 1.0,
        "gripper_2_close_s": 1.0,
        "rotate_s": 1.5,
    },
    "magazine": {
        "base_x": 4230.0,
        "base_y": 200.0,
        "base_z": 1600.0,
        "rows": 12,
        "columns": 10,
        "pitch_x": 60.0,
        "pitch_y": 60.0,
        "safe_z": 0.0,
        "change_z": 1400.0,
        "speed_factor": 1.0,
    },
    "magazine_2": {
        "base_x": 4230.0,
        "base_y": 200.0,
        "base_z": 1600.0,
        "rows": 12,
        "columns": 10,
        "pitch_x": 60.0,
        "pitch_y": 60.0,
        "safe_z": 0.0,
        "change_z": 1400.0,
        "speed_factor": 1.0,
    },
    "points": {
        "10": {"name": "MACHINE_1_ABOVE", "x": 2010.0, "y": 250.0, "z": 350.0, "speed_factor": 1.0},
        "11": {"name": "MACHINE_1_INSIDE", "x": 1920.0, "y": 90.0, "z": 800.0, "speed_factor": 1.0},
        "12": {"name": "MACHINE_1_CHUCK_APPROACH", "x": 2010.0, "y": 250.0, "z": 1730.0, "speed_factor": 1.0},
        "13": {"name": "MACHINE_1_CHUCK_POSITION", "x": 1880.0, "y": 250.0, "z": 1730.0, "speed_factor": 1.0},
        "14": {"name": "MACHINE_2_ABOVE", "x": 6910.0, "y": 250.0, "z": 350.0, "speed_factor": 1.0},
        "15": {"name": "MACHINE_2_INSIDE", "x": 6820.0, "y": 90.0, "z": 800.0, "speed_factor": 1.0},
        "16": {"name": "MACHINE_2_CHUCK_APPROACH", "x": 6910.0, "y": 250.0, "z": 1730.0, "speed_factor": 1.0},
        "17": {"name": "MACHINE_2_CHUCK_POSITION", "x": 6780.0, "y": 250.0, "z": 1730.0, "speed_factor": 1.0},
        "18": {"name": "MACHINE_3_ABOVE", "x": 11810.0, "y": 250.0, "z": 350.0, "speed_factor": 1.0},
        "19": {"name": "MACHINE_3_INSIDE", "x": 11810.0, "y": 90.0, "z": 800.0, "speed_factor": 1.0},
        "20": {"name": "MACHINE_3_CHUCK_APPROACH", "x": 11810.0, "y": 250.0, "z": 1730.0, "speed_factor": 1.0},
        "21": {"name": "MACHINE_3_CHUCK_POSITION", "x": 11680.0, "y": 250.0, "z": 1730.0, "speed_factor": 1.0},
        "22": {"name": "HOME_SAFETY", "x": 0.0, "y": 0.0, "z": 0.0, "speed_factor": 0.2},
    },
}


def _merge(default: dict[str, Any], supplied: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(default)
    for key, value in supplied.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = value
    return result


class ConfigStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or Path(__file__).resolve().parents[1] / "config.json"

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return copy.deepcopy(DEFAULT_CONFIG)
        try:
            supplied = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(supplied, dict):
                raise ValueError("Root JSON value must be an object")
            return _merge(DEFAULT_CONFIG, supplied)
        except (OSError, ValueError, json.JSONDecodeError):
            return copy.deepcopy(DEFAULT_CONFIG)

    def save(self, config: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.path.with_suffix(".json.tmp")
        temp_path.write_text(
            json.dumps(config, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temp_path.replace(self.path)
