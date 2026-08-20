from __future__ import annotations

import copy
import socket

import pytest

from robot_simulator.config import DEFAULT_CONFIG
from robot_simulator.constants import RobotMode
from robot_simulator.control_api import (
    CONTROL_API_VERSION,
    CONTROL_SERVICE_NAME,
    RobotControlApiServer,
    RobotControlClient,
    RobotControlService,
)
from robot_simulator.model import RobotModel


def free_tcp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def test_running_simulator_exposes_one_leased_test_control_session() -> None:
    model = RobotModel(copy.deepcopy(DEFAULT_CONFIG))
    modbus = {"running": True, "error": "", "host": "0.0.0.0", "port": 502, "unitId": 1}
    service = RobotControlService(model, lambda: modbus)
    port = free_tcp_port()
    server = RobotControlApiServer(service, "127.0.0.1", port)
    server.start()
    assert server.running, server.error

    owner = RobotControlClient(f"http://127.0.0.1:{port}", "run-1")
    other = RobotControlClient(f"http://127.0.0.1:{port}", "run-2")
    try:
        health = owner.health()
        assert health["service"] == CONTROL_SERVICE_NAME
        assert health["apiVersion"] == CONTROL_API_VERSION
        assert health["modbus"]["running"] is True

        acquired = owner.acquire(fast=True)
        assert acquired["session"]["active"] is True
        assert model.mode == RobotMode.AUTOMATIC
        assert model.snapshot()["time_scale"] == 250.0
        with pytest.raises(RuntimeError, match="another test run"):
            other.acquire(fast=False)

        owner.set_fault("motion_fault", True)
        assert model.fault_sources["motion_fault"] is True
        owner.clear()
        assert model.fault_sources["motion_fault"] is False
        assert model.reset_alarm()
        owner.set_mode(RobotMode.STOPPED)
        released = owner.release(stop_mode=False)
        assert released["session"]["active"] is False
        assert model.snapshot()["time_scale"] == 1.0
    finally:
        server.stop()


def test_control_session_requires_the_modbus_server() -> None:
    model = RobotModel(copy.deepcopy(DEFAULT_CONFIG))
    service = RobotControlService(model, lambda: {"running": False, "error": "not started"})
    with pytest.raises(Exception, match="Modbus server is not running"):
        service.acquire({"sessionId": "run-1", "fast": False})
