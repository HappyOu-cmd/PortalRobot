from __future__ import annotations

import copy
import socket
import time

from pymodbus.client import ModbusTcpClient

from robot_simulator.config import DEFAULT_CONFIG
from robot_simulator.constants import CommandCode, ExecutionState, RobotMode
from robot_simulator.model import RobotModel
from robot_simulator.modbus_server import RobotModbusServer


def free_tcp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def test_real_fc16_fc03_roundtrip() -> None:
    config = copy.deepcopy(DEFAULT_CONFIG)
    config["server"]["plc_heartbeat_timeout_s"] = 10.0
    config["motion"].update(
        speed_mm_s=5000.0,
        acceleration_mm_s2=10000.0,
        deceleration_mm_s2=10000.0,
        jerk_mm_s3=100000.0,
    )
    model = RobotModel(config)
    assert model.set_mode(RobotMode.AUTOMATIC)
    model.start_runtime()
    port = free_tcp_port()
    server = RobotModbusServer(model, "127.0.0.1", port, 1)
    server.start()
    deadline = time.monotonic() + 5.0
    while not server.running and not server.error and time.monotonic() < deadline:
        time.sleep(0.01)
    assert server.running, server.error

    client = ModbusTcpClient("127.0.0.1", port=port, timeout=1.0)
    try:
        assert client.connect()
        initial = client.read_holding_registers(1100, count=17, device_id=1)
        assert not initial.isError()
        assert initial.registers[16] == 3

        command = [int(CommandCode.MACHINE_1_ABOVE), 1, 0, 0, 0, 0, 0, 1, 1]
        written = client.write_registers(1000, command, device_id=1)
        assert not written.isError()

        deadline = time.monotonic() + 5.0
        status = None
        while time.monotonic() < deadline:
            status = client.read_holding_registers(1100, count=17, device_id=1)
            assert not status.isError()
            if status.registers[1] == int(ExecutionState.DONE):
                break
            time.sleep(0.02)
        assert status is not None
        assert status.registers[0] == 1  # AckSeq
        assert status.registers[1] == int(ExecutionState.DONE)
        assert status.registers[2] == 0
        assert status.registers[4] == int(CommandCode.MACHINE_1_ABOVE)
        assert status.registers[9:11] == [0, 20100]

        clear = [0, 0, 0, 0, 0, 0, 0, 1, 2]
        assert not client.write_registers(1000, clear, device_id=1).isError()
        deadline = time.monotonic() + 1.0
        while time.monotonic() < deadline:
            status = client.read_holding_registers(1100, count=17, device_id=1)
            if status.registers[1] == int(ExecutionState.IDLE):
                break
            time.sleep(0.01)
        assert status.registers[0] == 1
        assert status.registers[1] == int(ExecutionState.IDLE)
    finally:
        client.close()
        server.stop()
        model.stop_runtime()


def test_server_rejects_an_already_occupied_port() -> None:
    config = copy.deepcopy(DEFAULT_CONFIG)
    model = RobotModel(config)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = int(listener.getsockname()[1])
        server = RobotModbusServer(model, "127.0.0.1", port, 1)
        server.start()

        assert not server.running
        assert "already in use" in server.error
