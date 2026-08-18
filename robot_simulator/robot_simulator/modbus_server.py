from __future__ import annotations

import asyncio
import socket
import threading
from collections.abc import Callable

from pymodbus.constants import ExcCodes
from pymodbus.server import ModbusTcpServer
from pymodbus.simulator import DataType, SimData, SimDevice

from .constants import (
    COMMAND_REGISTER_COUNT,
    COMMAND_START_ADDRESS,
    STATUS_REGISTER_COUNT,
    STATUS_START_ADDRESS,
)
from .model import RobotModel


class RobotModbusServer:
    """Modbus TCP Server hosted in one dedicated asyncio thread."""

    def __init__(
        self,
        model: RobotModel,
        host: str,
        port: int,
        unit_id: int,
        on_state_change: Callable[[bool, str], None] | None = None,
    ) -> None:
        self.model = model
        self.host = host
        self.port = int(port)
        self.unit_id = int(unit_id)
        self.on_state_change = on_state_change
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._server: ModbusTcpServer | None = None
        self._running = threading.Event()
        self._error = ""

    @property
    def running(self) -> bool:
        return self._running.is_set()

    @property
    def error(self) -> str:
        return self._error

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._error = ""
        try:
            self._verify_exclusive_bind()
        except OSError:
            self._error = (
                f"TCP port {self.host}:{self.port} is already in use. "
                "Stop the other process that owns this port."
            )
            self._notify(False, self._error)
            return
        self._thread = threading.Thread(
            target=self._thread_main,
            name="modbus-server",
            daemon=True,
        )
        self._thread.start()

    def _verify_exclusive_bind(self) -> None:
        """Reject a second listener even on Windows where SO_REUSEADDR permits it."""
        family = socket.AF_INET6 if ":" in self.host else socket.AF_INET
        with socket.socket(family, socket.SOCK_STREAM) as probe:
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            probe.bind((self.host, self.port))

    def stop(self) -> None:
        loop = self._loop
        server = self._server
        if loop and server and loop.is_running():
            future = asyncio.run_coroutine_threadsafe(server.shutdown(), loop)
            try:
                future.result(timeout=3.0)
            except (TimeoutError, RuntimeError):
                pass
        thread = self._thread
        if thread and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=3.0)

    def restart(self, host: str, port: int, unit_id: int) -> None:
        self.stop()
        self.host = host
        self.port = int(port)
        self.unit_id = int(unit_id)
        self.start()

    def _thread_main(self) -> None:
        try:
            asyncio.run(self._run())
        except Exception as exc:  # server startup/runtime errors are shown in the UI
            self._error = str(exc)
            self._notify(False, self._error)
        finally:
            self._running.clear()
            self._server = None
            self._loop = None

    async def _run(self) -> None:
        self._loop = asyncio.get_running_loop()
        device = SimDevice(
            id=self.unit_id,
            simdata=[
                SimData(
                    address=COMMAND_START_ADDRESS,
                    count=COMMAND_REGISTER_COUNT,
                    values=0,
                    datatype=DataType.REGISTERS,
                ),
                SimData(
                    address=STATUS_START_ADDRESS,
                    count=STATUS_REGISTER_COUNT,
                    values=0,
                    datatype=DataType.REGISTERS,
                    readonly=True,
                ),
            ],
            action=self._datastore_action,
        )
        self._server = ModbusTcpServer(
            device,
            address=(self.host, self.port),
            ignore_missing_devices=False,
        )
        await self._server.serve_forever(background=True)
        self._running.set()
        self._notify(True, f"{self.host}:{self.port}, Unit ID {self.unit_id}")
        await self._server.serving

    async def _datastore_action(
        self,
        function_code: int,
        start_address: int,
        address: int,
        count: int,
        current_registers: list[int],
        set_values: list[int] | list[bool] | None,
    ) -> None | ExcCodes:
        status_offset = STATUS_START_ADDRESS - start_address
        current_registers[
            status_offset : status_offset + STATUS_REGISTER_COUNT
        ] = self.model.status_registers()

        if set_values is None:
            return None
        if (
            function_code != 16
            or address != COMMAND_START_ADDRESS
            or count != COMMAND_REGISTER_COUNT
            or len(set_values) != COMMAND_REGISTER_COUNT
        ):
            return ExcCodes.ILLEGAL_ADDRESS
        self.model.accept_command_registers([int(value) for value in set_values])
        return None

    def _notify(self, running: bool, message: str) -> None:
        if self.on_state_change:
            self.on_state_change(running, message)
