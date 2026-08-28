from __future__ import annotations

import copy

from robot_simulator.config import DEFAULT_CONFIG, ConfigStore


def test_points_survive_save_and_reload(tmp_path) -> None:
    path = tmp_path / "config.json"
    store = ConfigStore(path)
    config = copy.deepcopy(DEFAULT_CONFIG)
    config["points"]["10"].update(
        x=1234.5,
        y=-67.8,
        z=901.2,
        speed_factor=0.35,
    )

    store.save(config)
    loaded = ConfigStore(path).load()

    assert loaded["points"]["10"] == {
        "name": "MACHINE_1_ABOVE",
        "x": 1234.5,
        "y": -67.8,
        "z": 901.2,
        "speed_factor": 0.35,
    }


def test_saved_partial_config_is_merged_with_defaults(tmp_path) -> None:
    path = tmp_path / "config.json"
    store = ConfigStore(path)

    store.save({"points": {"10": {"x": 777.0}}})
    loaded = store.load()

    assert loaded["points"]["10"]["x"] == 777.0
    assert loaded["points"]["10"]["name"] == "MACHINE_1_ABOVE"
    assert loaded["points"]["11"] == DEFAULT_CONFIG["points"]["11"]
