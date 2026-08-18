from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .constants import FAST_TIME_SCALE, PROTOCOL_VERSION, RobotMode
from .model import RobotModel


CONTROL_API_VERSION = 1
CONTROL_SERVICE_NAME = "portal-robot-simulator-control"


class ControlApiError(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


class RobotControlService:
    """Local, leased test-control facade around the already running robot model."""

    def __init__(
        self,
        model: RobotModel,
        modbus_status: Callable[[], dict[str, Any]],
        *,
        lease_timeout_s: float = 15.0,
    ) -> None:
        self.model = model
        self.modbus_status = modbus_status
        self.lease_timeout_s = max(5.0, float(lease_timeout_s))
        self._lock = threading.RLock()
        self._session_id: str | None = None
        self._session_seen_at = 0.0
        self._expired_stop_pending = False

    def _clear_sources(self) -> None:
        for source, active in tuple(self.model.fault_sources.items()):
            if active:
                self.model.set_fault_source(source, False)
        self.model.set_plc_heartbeat_loss(False)
        self.model.freeze_robot_heartbeat = False

    def _expire_session(self) -> None:
        if self._expired_stop_pending and self.model.mode_change_allowed:
            self.model.set_mode(RobotMode.STOPPED)
            self._expired_stop_pending = False
        if self._session_id is None:
            return
        if time.monotonic() - self._session_seen_at <= self.lease_timeout_s:
            return
        self._clear_sources()
        self.model.set_fast_mode(False)
        if not self.model.set_mode(RobotMode.STOPPED):
            self._expired_stop_pending = True
        self._session_id = None
        self._session_seen_at = 0.0

    @property
    def session_active(self) -> bool:
        with self._lock:
            self._expire_session()
            return self._session_id is not None

    def status(self) -> dict[str, Any]:
        with self._lock:
            self._expire_session()
            snapshot = self.model.snapshot()
            return {
                "service": CONTROL_SERVICE_NAME,
                "apiVersion": CONTROL_API_VERSION,
                "protocolVersion": PROTOCOL_VERSION,
                "modbus": self.modbus_status(),
                "session": {"active": self._session_id is not None},
                "robot": {
                    "mode": snapshot["mode"],
                    "modeChangeAllowed": snapshot["mode_change_allowed"],
                    "ready": snapshot["ready"],
                    "executionState": snapshot["execution_state"],
                    "alarmCode": snapshot["alarm_code"],
                    "faultSources": snapshot["fault_sources"],
                    "timeScale": snapshot["time_scale"],
                },
            }

    @staticmethod
    def _session_from(payload: dict[str, Any]) -> str:
        session_id = str(payload.get("sessionId", "")).strip()
        if not session_id:
            raise ControlApiError(HTTPStatus.BAD_REQUEST, "sessionId is required")
        return session_id

    def _require_session(self, payload: dict[str, Any]) -> str:
        self._expire_session()
        session_id = self._session_from(payload)
        if self._session_id != session_id:
            raise ControlApiError(HTTPStatus.CONFLICT, "test-control session is not owned by this runner")
        self._session_seen_at = time.monotonic()
        return session_id

    def acquire(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._expire_session()
            session_id = self._session_from(payload)
            if self._session_id not in {None, session_id}:
                raise ControlApiError(HTTPStatus.CONFLICT, "simulator is already controlled by another test run")
            modbus = self.modbus_status()
            if not bool(modbus.get("running", False)):
                raise ControlApiError(HTTPStatus.SERVICE_UNAVAILABLE, "simulator Modbus server is not running")
            if not self.model.mode_change_allowed:
                raise ControlApiError(HTTPStatus.CONFLICT, "robot still has an active command")
            self._clear_sources()
            self.model.set_fast_mode(
                bool(payload.get("fast", False)),
                float(payload.get("factor", FAST_TIME_SCALE)),
            )
            if not self.model.set_mode(RobotMode.AUTOMATIC):
                self.model.set_fast_mode(False)
                raise ControlApiError(HTTPStatus.CONFLICT, "robot cannot enter automatic mode")
            self._session_id = session_id
            self._session_seen_at = time.monotonic()
            self._expired_stop_pending = False
            return self.status()

    def heartbeat(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._require_session(payload)
            return {"ok": True}

    def clear(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._require_session(payload)
            self._clear_sources()
            return self.status()

    def fault(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._require_session(payload)
            source = str(payload.get("source", ""))
            if source not in self.model.fault_sources:
                raise ControlApiError(HTTPStatus.BAD_REQUEST, f"unknown fault source: {source}")
            self.model.set_fault_source(source, bool(payload.get("active", False)))
            return self.status()

    def set_mode(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._require_session(payload)
            try:
                mode = RobotMode(str(payload.get("mode", "")))
            except ValueError as error:
                raise ControlApiError(HTTPStatus.BAD_REQUEST, "unknown robot mode") from error
            if not self.model.set_mode(mode):
                raise ControlApiError(HTTPStatus.CONFLICT, "robot command has not returned to IDLE")
            return self.status()

    def release(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._require_session(payload)
            self._clear_sources()
            self.model.set_fast_mode(False)
            if bool(payload.get("stopMode", False)) and not self.model.set_mode(RobotMode.STOPPED):
                raise ControlApiError(HTTPStatus.CONFLICT, "robot command has not returned to IDLE")
            self._session_id = None
            self._session_seen_at = 0.0
            self._expired_stop_pending = False
            return self.status()


class _ControlHttpServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, address: tuple[str, int], service: RobotControlService) -> None:
        self.service = service
        super().__init__(address, _ControlRequestHandler)


class _ControlRequestHandler(BaseHTTPRequestHandler):
    server: _ControlHttpServer

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _reply(self, status: int, value: dict[str, Any]) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _payload(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 65_536:
            raise ControlApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "request is too large")
        if length == 0:
            return {}
        try:
            value = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ControlApiError(HTTPStatus.BAD_REQUEST, "invalid JSON") from error
        if not isinstance(value, dict):
            raise ControlApiError(HTTPStatus.BAD_REQUEST, "JSON object is required")
        return value

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler contract
        try:
            if self.path != "/api/health":
                raise ControlApiError(HTTPStatus.NOT_FOUND, "not found")
            self._reply(HTTPStatus.OK, self.server.service.status())
        except ControlApiError as error:
            self._reply(error.status, {"error": str(error)})

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler contract
        routes = {
            "/api/test/session/acquire": self.server.service.acquire,
            "/api/test/session/heartbeat": self.server.service.heartbeat,
            "/api/test/session/release": self.server.service.release,
            "/api/test/clear": self.server.service.clear,
            "/api/test/fault": self.server.service.fault,
            "/api/test/mode": self.server.service.set_mode,
        }
        try:
            operation = routes.get(self.path)
            if operation is None:
                raise ControlApiError(HTTPStatus.NOT_FOUND, "not found")
            self._reply(HTTPStatus.OK, operation(self._payload()))
        except ControlApiError as error:
            self._reply(error.status, {"error": str(error)})
        except Exception as error:  # defensive API boundary
            self._reply(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})


class RobotControlApiServer:
    def __init__(self, service: RobotControlService, host: str = "127.0.0.1", port: int = 8765) -> None:
        if host not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("test-control API may bind only to loopback")
        self.service = service
        self.host = host
        self.port = int(port)
        self.running = False
        self.error = ""
        self._server: _ControlHttpServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self.running:
            return
        try:
            self._server = _ControlHttpServer((self.host, self.port), self.service)
        except OSError as error:
            self.error = f"Test-control API {self.host}:{self.port} failed: {error}"
            return
        self.error = ""
        self.running = True
        self._thread = threading.Thread(target=self._serve, name="robot-test-control", daemon=True)
        self._thread.start()

    def _serve(self) -> None:
        assert self._server is not None
        try:
            self._server.serve_forever(poll_interval=0.1)
        finally:
            self.running = False

    def stop(self) -> None:
        server, thread = self._server, self._thread
        self._server = None
        self._thread = None
        if server is not None:
            server.shutdown()
            server.server_close()
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=2.0)
        self.running = False


class RobotControlClient:
    def __init__(self, base_url: str, session_id: str, timeout_s: float = 3.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.session_id = session_id
        self.timeout_s = max(0.2, float(timeout_s))

    def _request(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            f"{self.base_url}{path}",
            data=data,
            headers={"Content-Type": "application/json"} if data is not None else {},
            method="POST" if data is not None else "GET",
        )
        try:
            with urlopen(request, timeout=self.timeout_s) as response:
                value = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                body = json.loads(error.read().decode("utf-8"))
                message = str(body.get("error", error.reason))
            except (UnicodeDecodeError, json.JSONDecodeError):
                message = str(error.reason)
            raise RuntimeError(f"Simulator control API rejected the request: {message}") from error
        except (URLError, TimeoutError, OSError) as error:
            raise RuntimeError(
                f"Running robot simulator is not available at {self.base_url}. "
                "Start or restart the simulator before the test."
            ) from error
        if not isinstance(value, dict):
            raise RuntimeError("Simulator control API returned an invalid response")
        return value

    def health(self) -> dict[str, Any]:
        return self._request("/api/health")

    def acquire(self, fast: bool) -> dict[str, Any]:
        return self._request("/api/test/session/acquire", {
            "sessionId": self.session_id, "fast": bool(fast), "factor": FAST_TIME_SCALE,
        })

    def heartbeat(self) -> dict[str, Any]:
        return self._request("/api/test/session/heartbeat", {"sessionId": self.session_id})

    def clear(self) -> dict[str, Any]:
        return self._request("/api/test/clear", {"sessionId": self.session_id})

    def set_fault(self, source: str, active: bool) -> dict[str, Any]:
        return self._request("/api/test/fault", {
            "sessionId": self.session_id, "source": source, "active": bool(active),
        })

    def set_mode(self, mode: RobotMode) -> dict[str, Any]:
        return self._request("/api/test/mode", {"sessionId": self.session_id, "mode": mode.value})

    def release(self, *, stop_mode: bool) -> dict[str, Any]:
        return self._request("/api/test/session/release", {
            "sessionId": self.session_id, "stopMode": bool(stop_mode),
        })
