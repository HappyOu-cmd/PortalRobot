from __future__ import annotations

import argparse
import signal
import time

from .config import ConfigStore
from .control_api import RobotControlApiServer, RobotControlService
from .model import RobotModel


def main() -> int:
    parser = argparse.ArgumentParser(description="Portal Robot SC-500 Modbus TCP simulator")
    parser.add_argument("--headless", action="store_true", help="Run Modbus server without Qt UI")
    parser.add_argument("--host", help="Override bind IP for this run")
    parser.add_argument("--port", type=int, help="Override TCP port for this run")
    parser.add_argument("--unit-id", type=int, help="Override Modbus Unit ID for this run")
    parser.add_argument("--control-port", type=int, help="Override local test-control API port")
    args = parser.parse_args()

    store = ConfigStore()
    config = store.load()
    if args.host:
        config["server"]["host"] = args.host
    if args.port:
        config["server"]["port"] = args.port
    if args.unit_id is not None:
        config["server"]["unit_id"] = args.unit_id
    if args.control_port is not None:
        config["control_api"]["port"] = args.control_port
    model = RobotModel(config)

    if not args.headless:
        from .app import run_gui

        return run_gui(model, store)

    from .modbus_server import RobotModbusServer

    model.start_runtime()
    server_cfg = config["server"]
    server = RobotModbusServer(
        model,
        str(server_cfg["host"]),
        int(server_cfg["port"]),
        int(server_cfg["unit_id"]),
        lambda running, message: print(
            f"Modbus server {'started' if running else 'stopped'}: {message}",
            flush=True,
        ),
    )
    control_cfg = config["control_api"]
    control_service = RobotControlService(
        model,
        lambda: {
            "running": server.running,
            "error": server.error,
            "host": server.host,
            "port": server.port,
            "unitId": server.unit_id,
        },
        lease_timeout_s=float(control_cfg["lease_timeout_s"]),
    )
    control_server = RobotControlApiServer(
        control_service,
        str(control_cfg["host"]),
        int(control_cfg["port"]),
    )
    server.start()
    control_server.start()
    if control_server.error:
        print(control_server.error, flush=True)
        server.stop()
        model.stop_runtime()
        return 1
    stopping = False

    def stop_handler(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, stop_handler)
    signal.signal(signal.SIGTERM, stop_handler)
    try:
        while not stopping:
            if server.error:
                return 1
            time.sleep(0.2)
    finally:
        control_server.stop()
        server.stop()
        model.stop_runtime()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
