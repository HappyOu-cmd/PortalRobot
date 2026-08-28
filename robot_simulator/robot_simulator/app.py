from __future__ import annotations

import copy
from typing import Any

from PySide6.QtCore import QObject, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QButtonGroup,
    QComboBox,
    QDoubleSpinBox,
    QFormLayout,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from .config import ConfigStore
from .constants import (
    ALARM_TEXT,
    GRIPPER_1_CLOSED,
    GRIPPER_1_OPEN,
    GRIPPER_2_CLOSED,
    GRIPPER_2_OPEN,
    POINT_NAMES,
    ROTATED_TO_BLANK,
    ROTATED_TO_DETAIL,
    AlarmCode,
    CommandCode,
    RobotMode,
)
from .control_api import RobotControlApiServer, RobotControlService
from .model import RobotModel
from .modbus_server import RobotModbusServer
from .widgets import Section, StatusPill


STYLE = """
QWidget { background: #0b1220; color: #dbe7f4; font-family: "Segoe UI"; font-size: 13px; }
QMainWindow { background: #08101c; }
#topBar { background: #0f1b2d; border-bottom: 1px solid #24334a; }
#appTitle { font-size: 21px; font-weight: 700; color: #f8fafc; }
#appSubtitle, #sectionSubtitle { color: #8292a8; }
#section { background: #101c2e; border: 1px solid #25354d; border-radius: 7px; }
#sectionTitle { font-size: 15px; font-weight: 700; color: #f1f5f9; }
#statusPill { background: #0c1727; border: 1px solid #263750; border-radius: 5px; }
#statusTitle { color: #91a1b8; }
#statusValue { font-weight: 600; color: #e7edf5; }
QTabWidget::pane { border: 1px solid #25354d; background: #0b1220; }
QTabBar::tab { background: #101c2e; color: #8fa0b7; padding: 11px 22px; border: 1px solid #25354d; }
QTabBar::tab:selected { background: #15304a; color: #e8f4ff; border-bottom: 2px solid #38bdf8; }
QPushButton { background: #17263b; border: 1px solid #31445f; border-radius: 5px; padding: 8px 13px; font-weight: 600; }
QPushButton:hover { background: #1e344f; border-color: #4d6a8f; }
QPushButton:pressed { background: #122034; }
QPushButton:disabled { color: #526177; background: #101827; border-color: #243044; }
QPushButton:checked { background: #075985; border-color: #38bdf8; color: #f0f9ff; }
QPushButton[role="danger"] { background: #3a1720; border-color: #7f1d2d; color: #fecdd3; }
QPushButton[role="danger"]:checked { background: #991b1b; border-color: #fb7185; color: white; }
QPushButton[role="primary"] { background: #075985; border-color: #0ea5e9; color: white; }
QLineEdit, QSpinBox, QDoubleSpinBox, QComboBox, QTextEdit { background: #091423; border: 1px solid #2b3c55; border-radius: 4px; padding: 6px; selection-background-color: #0369a1; }
QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus, QComboBox:focus { border-color: #38bdf8; }
QTableWidget { background: #0b1524; alternate-background-color: #0e1a2b; border: 1px solid #2a3b53; gridline-color: #24344b; }
QHeaderView::section { background: #14233a; color: #aebdd0; padding: 7px; border: 0; border-right: 1px solid #2a3b53; font-weight: 600; }
QTableWidget::item:selected { background: #075985; }
QScrollBar:vertical { background: #0d1726; width: 11px; }
QScrollBar::handle:vertical { background: #34465f; min-height: 30px; border-radius: 4px; }
"""


class ServerBridge(QObject):
    changed = Signal(bool, str)


def make_double(value: float, minimum: float = -1_000_000.0, maximum: float = 1_000_000.0) -> QDoubleSpinBox:
    box = QDoubleSpinBox()
    box.setRange(minimum, maximum)
    box.setDecimals(2)
    box.setSingleStep(10.0)
    box.setValue(float(value))
    return box


class MainWindow(QMainWindow):
    def __init__(self, model: RobotModel, store: ConfigStore) -> None:
        super().__init__()
        self.model = model
        self.store = store
        self.config = model.config
        server_cfg = self.config["server"]
        self.bridge = ServerBridge()
        self.bridge.changed.connect(self._server_state_changed)
        self.server = RobotModbusServer(
            model,
            str(server_cfg["host"]),
            int(server_cfg["port"]),
            int(server_cfg["unit_id"]),
            lambda running, message: self.bridge.changed.emit(running, message),
        )
        control_cfg = self.config["control_api"]
        self.control_service = RobotControlService(
            model,
            lambda: {
                "running": self.server.running,
                "error": self.server.error,
                "host": self.server.host,
                "port": self.server.port,
                "unitId": self.server.unit_id,
            },
            lease_timeout_s=float(control_cfg["lease_timeout_s"]),
        )
        self.control_server = RobotControlApiServer(
            self.control_service,
            str(control_cfg["host"]),
            int(control_cfg["port"]),
        )

        self.setWindowTitle("Portal Robot · SC-500 Modbus Simulator")
        self.resize(1440, 900)
        self.setMinimumSize(1180, 720)
        self._point_rows: dict[int, int] = {}
        self._fault_buttons: dict[str, QPushButton] = {}
        self._shutdown_complete = False
        self._build_ui()
        self._connect_configuration_autosave()
        self._refresh()

        self.timer = QTimer(self)
        self.timer.timeout.connect(self._refresh)
        self.timer.start(100)
        self.model.start_runtime()
        self.server.start()
        self.control_server.start()

    def _build_ui(self) -> None:
        central = QWidget()
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        root.addWidget(self._build_top_bar())
        self.tabs = QTabWidget()
        self.tabs.addTab(self._build_control_tab(), "Управление")
        self.tabs.addTab(self._build_points_tab(), "Точки")
        self.tabs.addTab(self._build_dynamics_tab(), "Динамика")
        self.tabs.addTab(self._build_diagnostics_tab(), "Диагностика")
        root.addWidget(self.tabs, 1)
        self.setCentralWidget(central)

    def _build_top_bar(self) -> QWidget:
        bar = QFrame()
        bar.setObjectName("topBar")
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(20, 12, 20, 12)
        title_box = QVBoxLayout()
        title = QLabel("SC-500 · ROBOT SIMULATOR")
        title.setObjectName("appTitle")
        subtitle = QLabel("Исполняемая модель контроллера · Modbus TCP · Protocol v3")
        subtitle.setObjectName("appSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        layout.addLayout(title_box)
        layout.addStretch()
        self.server_pill = StatusPill("MODBUS SERVER")
        self.server_pill.setFixedWidth(260)
        layout.addWidget(self.server_pill)
        self.control_pill = StatusPill("TEST CONTROL API")
        self.control_pill.setFixedWidth(220)
        layout.addWidget(self.control_pill)
        self.ready_pill = StatusPill("ROBOT READY")
        self.ready_pill.setFixedWidth(220)
        layout.addWidget(self.ready_pill)
        return bar

    def _build_control_tab(self) -> QWidget:
        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(16)

        left = QVBoxLayout()
        mode = Section("Режим контроллера", "В Manual доступны только локальные команды этого пульта. Внешние команды PLC отклоняются.")
        mode_row = QHBoxLayout()
        self.mode_group = QButtonGroup(self)
        self.mode_group.setExclusive(True)
        for text, value in (("ОСТАНОВЛЕН", RobotMode.STOPPED), ("РУЧНОЙ", RobotMode.MANUAL), ("АВТОМАТ", RobotMode.AUTOMATIC)):
            button = QPushButton(text)
            button.setCheckable(True)
            button.clicked.connect(lambda checked=False, selected=value: self._set_mode(selected))
            self.mode_group.addButton(button)
            button.setProperty("mode", value.value)
            mode_row.addWidget(button)
        mode.body.addLayout(mode_row)
        left.addWidget(mode)

        telemetry = Section("Телеметрия", "Координаты публикуются как signed DINT × 0,1 мм, старшее WORD первым.")
        coords = QHBoxLayout()
        self.coord_labels: list[QLabel] = []
        for axis in "XYZ":
            box = QFrame()
            box.setObjectName("statusPill")
            box_layout = QVBoxLayout(box)
            name = QLabel(axis)
            name.setStyleSheet("color:#7dd3fc;font-weight:700")
            value = QLabel("0.0 mm")
            value.setStyleSheet("font-size:24px;font-weight:700;color:#f8fafc")
            box_layout.addWidget(name)
            box_layout.addWidget(value)
            self.coord_labels.append(value)
            coords.addWidget(box)
        telemetry.body.addLayout(coords)
        self.exec_pill = StatusPill("ExecutionState")
        self.phase_pill = StatusPill("OperationPhase")
        self.command_pill = StatusPill("ActiveCommand")
        self.alarm_pill = StatusPill("Alarm")
        for pill in (self.exec_pill, self.phase_pill, self.command_pill, self.alarm_pill):
            telemetry.body.addWidget(pill)
        left.addWidget(telemetry, 1)
        layout.addLayout(left, 5)

        right = QVBoxLayout()
        manual = Section("Локальный пульт", "Команды разрешены только в ручном режиме и не проходят через Modbus-регистры.")
        point_row = QHBoxLayout()
        self.manual_point = QComboBox()
        for code in range(10, 26):
            self.manual_point.addItem(f"{code} · {POINT_NAMES[code]}", code)
        self.manual_slot = QSpinBox()
        self.manual_slot.setRange(0, 120)
        self.manual_slot.setPrefix("Слот ")
        self.manual_magazine = QComboBox()
        self.manual_magazine.addItem("Магазин 1", 1)
        self.manual_magazine.addItem("Магазин 2", 2)
        self.move_point_button = QPushButton("ПЕРЕЙТИ К ТОЧКЕ")
        self.move_point_button.setProperty("role", "primary")
        self.move_point_button.clicked.connect(self._local_point)
        point_row.addWidget(self.manual_point, 2)
        point_row.addWidget(self.manual_magazine)
        point_row.addWidget(self.manual_slot)
        point_row.addWidget(self.move_point_button)
        manual.body.addLayout(point_row)

        action_grid = QGridLayout()
        actions = [
            ("Захват 1 · открыть", CommandCode.GRIPPER_1_OPEN),
            ("Захват 1 · закрыть", CommandCode.GRIPPER_1_CLOSE),
            ("Захват 2 · открыть", CommandCode.GRIPPER_2_OPEN),
            ("Захват 2 · закрыть", CommandCode.GRIPPER_2_CLOSE),
            ("К заготовке", CommandCode.ROTATE_TO_BLANK),
            ("К готовой детали", CommandCode.ROTATE_TO_DETAIL),
        ]
        self.manual_action_buttons: list[QPushButton] = []
        for index, (text, command) in enumerate(actions):
            button = QPushButton(text)
            button.clicked.connect(lambda checked=False, selected=command: self.model.local_command(int(selected)))
            action_grid.addWidget(button, index // 2, index % 2)
            self.manual_action_buttons.append(button)
        manual.body.addLayout(action_grid)

        xyz_row = QHBoxLayout()
        self.xyz_inputs = [make_double(0.0) for _ in range(3)]
        for axis, field in zip("XYZ", self.xyz_inputs, strict=True):
            field.setPrefix(f"{axis} ")
            field.setSuffix(" mm")
            xyz_row.addWidget(field)
        self.move_xyz_button = QPushButton("MOVE XYZ")
        self.move_xyz_button.clicked.connect(self._local_xyz)
        xyz_row.addWidget(self.move_xyz_button)
        manual.body.addLayout(xyz_row)
        right.addWidget(manual)

        feedback = Section("Захваты и обратная связь")
        self.gripper_pills = [
            StatusPill("Захват 1 открыт"),
            StatusPill("Захват 1 закрыт"),
            StatusPill("Захват 2 открыт"),
            StatusPill("Захват 2 закрыт"),
            StatusPill("Ориентация к заготовке"),
            StatusPill("Ориентация к детали"),
        ]
        grid = QGridLayout()
        for index, pill in enumerate(self.gripper_pills):
            grid.addWidget(pill, index // 2, index % 2)
        feedback.body.addLayout(grid)
        right.addWidget(feedback)
        right.addStretch()
        layout.addLayout(right, 6)
        return page

    def _build_points_tab(self) -> QWidget:
        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(16)
        points_section = Section("Именованные точки 10–22", "XYZ и SpeedFactor хранятся в контроллере робота. PLC передаёт только CommandCode.")
        self.points_table = QTableWidget(13, 6)
        self.points_table.setHorizontalHeaderLabels(["Код", "Имя", "X, мм", "Y, мм", "Z, мм", "SpeedFactor"])
        self.points_table.setAlternatingRowColors(True)
        self.points_table.verticalHeader().setVisible(False)
        self.points_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        for row, code in enumerate(range(10, 23)):
            self._point_rows[code] = row
            point = self.config["points"][str(code)]
            for column, value in enumerate((code, point["name"], point["x"], point["y"], point["z"], point["speed_factor"])):
                item = QTableWidgetItem(str(value))
                if column < 2:
                    item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsEditable)
                    item.setForeground(QColor("#7dd3fc"))
                self.points_table.setItem(row, column, item)
        points_section.body.addWidget(self.points_table)
        layout.addWidget(points_section, 7)

        magazine = Section("Геометрия магазинов", "Точки 23–25 рассчитываются по MagazineId + ActiveSlot. Для каждого магазина используется собственная база.")
        magazine_tabs = QTabWidget()
        self.mag_fields: dict[str, dict[str, QDoubleSpinBox | QSpinBox]] = {}
        for config_key, title in (("magazine", "Магазин 1"), ("magazine_2", "Магазин 2")):
            tab = QWidget()
            form = QFormLayout(tab)
            mag = self.config[config_key]
            fields: dict[str, QDoubleSpinBox | QSpinBox] = {}
            for key, label in (("base_x", "База X"), ("base_y", "База Y"), ("base_z", "Точка слота Z"), ("pitch_x", "Шаг X"), ("pitch_y", "Шаг Y"), ("safe_z", "Safe Z"), ("change_z", "Change Z"), ("speed_factor", "SpeedFactor")):
                field = make_double(float(mag[key]))
                if key == "speed_factor":
                    field.setRange(0.01, 1.0)
                    field.setSingleStep(0.05)
                form.addRow(label, field)
                fields[key] = field
            for key, label in (("rows", "Строки"), ("columns", "Столбцы")):
                field = QSpinBox()
                field.setRange(1, 127)
                field.setValue(int(mag[key]))
                form.addRow(label, field)
                fields[key] = field
            self.mag_fields[config_key] = fields
            magazine_tabs.addTab(tab, title)
        magazine.body.addWidget(magazine_tabs)
        self.save_points_button = QPushButton("СОХРАНИТЬ ТОЧКИ И МАГАЗИН")
        self.save_points_button.setProperty("role", "primary")
        self.save_points_button.clicked.connect(self._save_configuration)
        magazine.body.addWidget(self.save_points_button)
        magazine.body.addStretch()
        layout.addWidget(magazine, 3)
        return page

    def _build_dynamics_tab(self) -> QWidget:
        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(18, 18, 18, 18)
        motion = Section("S-образный профиль движения", "1 единица координаты = 1 мм. Параметры реально участвуют в интегрировании траектории.")
        form = QFormLayout()
        self.motion_fields: dict[str, QDoubleSpinBox] = {}
        labels = {
            "speed_mm_s": "Скорость, мм/с",
            "acceleration_mm_s2": "Ускорение, мм/с²",
            "deceleration_mm_s2": "Замедление, мм/с²",
            "jerk_mm_s3": "Рывок, мм/с³",
        }
        for key, label in labels.items():
            field = make_double(float(self.config["motion"][key]), 0.1, 1_000_000.0)
            form.addRow(label, field)
            self.motion_fields[key] = field
        motion.body.addLayout(form)
        layout.addWidget(motion)

        gripper = Section("Время дискретных действий", "Stop не обрывает захват или переворот: начатое действие заканчивается, затем фиксируется авария.")
        grip_form = QFormLayout()
        self.gripper_fields: dict[str, QDoubleSpinBox] = {}
        grip_labels = {
            "gripper_1_open_s": "Захват 1 открыть, с",
            "gripper_1_close_s": "Захват 1 закрыть, с",
            "gripper_2_open_s": "Захват 2 открыть, с",
            "gripper_2_close_s": "Захват 2 закрыть, с",
            "rotate_s": "Переворот, с",
        }
        for key, label in grip_labels.items():
            field = make_double(float(self.config["gripper"][key]), 0.02, 3600.0)
            field.setSingleStep(0.1)
            grip_form.addRow(label, field)
            self.gripper_fields[key] = field
        gripper.body.addLayout(grip_form)
        save = QPushButton("СОХРАНИТЬ ДИНАМИКУ")
        save.setProperty("role", "primary")
        save.clicked.connect(self._save_configuration)
        gripper.body.addWidget(save)
        layout.addWidget(gripper)
        return page

    def _build_diagnostics_tab(self) -> QWidget:
        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(16)

        left = QVBoxLayout()
        faults = Section("Инъекция аварий", "Повторное нажатие снимает физическую причину. Защёлкнутая авария очищается только Reset.")
        fault_grid = QGridLayout()
        definitions = [
            ("emergency_stop", "E-STOP"),
            ("motion_fault", "Авария движения"),
            ("gripper_1_fault", "Авария захвата 1"),
            ("gripper_2_fault", "Авария захвата 2"),
            ("safety_interlock", "Защитная блокировка"),
            ("homing_lost", "Потеря Homed"),
            ("drives_disabled", "Отключить приводы"),
        ]
        for index, (source, text) in enumerate(definitions):
            button = QPushButton(text)
            button.setCheckable(True)
            button.setProperty("role", "danger")
            button.toggled.connect(lambda active, selected=source: self.model.set_fault_source(selected, active))
            self._fault_buttons[source] = button
            fault_grid.addWidget(button, index // 2, index % 2)
        self.freeze_robot_button = QPushButton("Зависание RobotHeartbeat")
        self.freeze_robot_button.setCheckable(True)
        self.freeze_robot_button.setProperty("role", "danger")
        self.freeze_robot_button.toggled.connect(self._freeze_robot_heartbeat)
        fault_grid.addWidget(self.freeze_robot_button, 4, 0)
        self.lose_plc_button = QPushButton("Потеря PlcHeartbeat")
        self.lose_plc_button.setCheckable(True)
        self.lose_plc_button.setProperty("role", "danger")
        self.lose_plc_button.toggled.connect(self.model.set_plc_heartbeat_loss)
        fault_grid.addWidget(self.lose_plc_button, 4, 1)
        faults.body.addLayout(fault_grid)
        reset = QPushButton("RESET АВАРИИ")
        reset.clicked.connect(self.model.reset_alarm)
        faults.body.addWidget(reset)
        left.addWidget(faults)

        server = Section("Modbus TCP Server", "PLC использует FC16 offset 1000 × 9 и FC03 offset 1100 × 17.")
        server_form = QFormLayout()
        cfg = self.config["server"]
        self.host_field = QLineEdit(str(cfg["host"]))
        self.port_field = QSpinBox(); self.port_field.setRange(1, 65535); self.port_field.setValue(int(cfg["port"]))
        self.unit_field = QSpinBox(); self.unit_field.setRange(0, 255); self.unit_field.setValue(int(cfg["unit_id"]))
        self.plc_timeout_field = make_double(float(cfg["plc_heartbeat_timeout_s"]), 0.5, 60.0)
        for label, field in (("Bind IP", self.host_field), ("Порт", self.port_field), ("Unit ID", self.unit_field), ("PLC heartbeat timeout, с", self.plc_timeout_field)):
            server_form.addRow(label, field)
        server.body.addLayout(server_form)
        server_buttons = QHBoxLayout()
        self.start_server_button = QPushButton("ЗАПУСТИТЬ")
        self.start_server_button.clicked.connect(self._start_server)
        self.stop_server_button = QPushButton("ОСТАНОВИТЬ")
        self.stop_server_button.setProperty("role", "danger")
        self.stop_server_button.clicked.connect(self.server.stop)
        apply_server = QPushButton("ПРИМЕНИТЬ И ПЕРЕЗАПУСТИТЬ")
        apply_server.clicked.connect(self._apply_server)
        server_buttons.addWidget(self.start_server_button)
        server_buttons.addWidget(self.stop_server_button)
        server_buttons.addWidget(apply_server)
        server.body.addLayout(server_buttons)
        left.addWidget(server)
        layout.addLayout(left, 5)

        right = QVBoxLayout()
        registers = Section("Живые регистры", "Нумерация в таблице документная; PDU-адрес на единицу меньше.")
        tables = QHBoxLayout()
        self.command_table = self._register_table([f"{1001 + i}" for i in range(9)])
        self.status_table = self._register_table([f"{1101 + i}" for i in range(17)])
        tables.addWidget(self.command_table)
        tables.addWidget(self.status_table)
        registers.body.addLayout(tables)
        right.addWidget(registers, 3)
        events = Section("Журнал контроллера")
        self.event_log = QTextEdit()
        self.event_log.setReadOnly(True)
        self.event_log.setFont(QFont("Cascadia Mono", 10))
        events.body.addWidget(self.event_log)
        right.addWidget(events, 2)
        layout.addLayout(right, 7)
        return page

    @staticmethod
    def _register_table(addresses: list[str]) -> QTableWidget:
        table = QTableWidget(len(addresses), 3)
        table.setHorizontalHeaderLabels(["Регистр", "DEC", "HEX"])
        table.verticalHeader().setVisible(False)
        table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        for row, address in enumerate(addresses):
            table.setItem(row, 0, QTableWidgetItem(address))
            table.setItem(row, 1, QTableWidgetItem("0"))
            table.setItem(row, 2, QTableWidgetItem("0x0000"))
        return table

    def _set_mode(self, mode: RobotMode) -> None:
        if not self.model.set_mode(mode):
            QMessageBox.warning(self, "Смена режима запрещена", "Дождитесь IDLE и снятия Execute текущей команды.")

    def _local_point(self) -> None:
        self.model.local_command(int(self.manual_point.currentData()), self.manual_slot.value(), int(self.manual_magazine.currentData()))

    def _local_xyz(self) -> None:
        self.model.local_move_xyz(*(field.value() for field in self.xyz_inputs))

    def _freeze_robot_heartbeat(self, active: bool) -> None:
        self.model.freeze_robot_heartbeat = bool(active)

    def _start_server(self) -> None:
        self.server.start()

    def _apply_server(self) -> None:
        self._save_configuration()
        self.server.restart(self.host_field.text().strip(), self.port_field.value(), self.unit_field.value())

    def _server_state_changed(self, running: bool, message: str) -> None:
        self.server_pill.set_state(running, "RUNNING" if running else "STOPPED", warning=not running)
        if not running and message:
            self.server_pill.setToolTip(message)

    def _connect_configuration_autosave(self) -> None:
        self.points_table.itemChanged.connect(self._configuration_changed)
        for fields in (*self.mag_fields.values(), self.motion_fields, self.gripper_fields):
            for field in fields.values():
                field.valueChanged.connect(self._configuration_changed)

    def _configuration_changed(self, *_args: Any) -> None:
        # Save committed edits immediately. Relying only on closeEvent loses
        # teaching data when the console or process is stopped externally.
        self._save_configuration()

    def _commit_active_point_editor(self) -> None:
        focus_widget = QApplication.focusWidget()
        if focus_widget is not None and self.points_table.isAncestorOf(focus_widget):
            self.save_points_button.setFocus(Qt.FocusReason.OtherFocusReason)
            QApplication.processEvents()

    def _save_configuration(self) -> bool:
        updated = copy.deepcopy(self.config)
        for code, row in self._point_rows.items():
            point = updated["points"][str(code)]
            try:
                point["x"] = float(self.points_table.item(row, 2).text().replace(",", "."))
                point["y"] = float(self.points_table.item(row, 3).text().replace(",", "."))
                point["z"] = float(self.points_table.item(row, 4).text().replace(",", "."))
                point["speed_factor"] = max(0.01, min(1.0, float(self.points_table.item(row, 5).text().replace(",", "."))))
            except ValueError:
                QMessageBox.warning(self, "Ошибка точки", f"Проверьте числовые значения точки {code}.")
                return False
        for config_key, fields in self.mag_fields.items():
            for key, field in fields.items():
                updated[config_key][key] = field.value()
            updated[config_key]["rows"] = int(updated[config_key]["rows"])
            updated[config_key]["columns"] = int(updated[config_key]["columns"])
        for key, field in self.motion_fields.items():
            updated["motion"][key] = field.value()
        for key, field in self.gripper_fields.items():
            updated["gripper"][key] = field.value()
        updated["server"]["host"] = self.host_field.text().strip() or "0.0.0.0"
        updated["server"]["port"] = self.port_field.value()
        updated["server"]["unit_id"] = self.unit_field.value()
        updated["server"]["plc_heartbeat_timeout_s"] = self.plc_timeout_field.value()
        try:
            self.store.save(updated)
        except OSError as error:
            QMessageBox.critical(self, "Точки не сохранены", f"Не удалось записать {self.store.path}:\n{error}")
            return False
        self.config = updated
        self.model.update_config(updated)
        return True

    def _refresh(self) -> None:
        snap = self.model.snapshot()
        test_session_active = self.control_service.session_active
        for button in self.mode_group.buttons():
            button.blockSignals(True)
            button.setChecked(button.property("mode") == snap["mode"])
            button.setEnabled(bool(snap["mode_change_allowed"]) and not test_session_active)
            button.blockSignals(False)
        self.ready_pill.set_state(bool(snap["ready"]), "READY" if snap["ready"] else "NOT READY", warning=bool(snap["alarm_code"]))
        self.server_pill.set_state(self.server.running, "RUNNING" if self.server.running else "STOPPED", warning=not self.server.running)
        self.control_pill.set_state(
            self.control_server.running,
            "TEST ACTIVE" if test_session_active else "READY" if self.control_server.running else "STOPPED",
            warning=not self.control_server.running,
        )
        self.control_pill.setToolTip(self.control_server.error)
        for label, value in zip(self.coord_labels, snap["position"], strict=True):
            label.setText(f"{value:,.1f} mm".replace(",", " "))
        self.exec_pill.set_state(snap["execution_name"] == "BUSY", f"{snap['execution_state']} · {snap['execution_name']}", warning=snap["execution_name"] in {"ERROR", "STOPPED"})
        self.phase_pill.set_state(snap["operation_phase"] not in {0, 100}, f"{snap['operation_phase']} · {snap['operation_name']}", warning=snap["operation_phase"] == 100)
        self.command_pill.set_state(snap["active_command"] != 0, f"{snap['active_command']} · {snap['active_command_name']}")
        self.alarm_pill.set_state(snap["alarm_code"] == 0, f"{snap['alarm_code']} · {snap['alarm_text']}", warning=snap["alarm_code"] != 0)

        manual_allowed = (
            snap["mode"] == RobotMode.MANUAL.value
            and snap["execution_name"] == "IDLE"
            and snap["alarm_code"] == 0
            and not test_session_active
        )
        self.move_point_button.setEnabled(manual_allowed)
        self.move_xyz_button.setEnabled(manual_allowed)
        for button in self.manual_action_buttons:
            button.setEnabled(manual_allowed)

        grip = snap["gripper_status"]
        masks = [GRIPPER_1_OPEN, GRIPPER_1_CLOSED, GRIPPER_2_OPEN, GRIPPER_2_CLOSED, ROTATED_TO_BLANK, ROTATED_TO_DETAIL]
        for pill, mask in zip(self.gripper_pills, masks, strict=True):
            active = bool(grip & mask)
            pill.set_state(active, "ДА" if active else "НЕТ")

        self.freeze_robot_button.blockSignals(True); self.freeze_robot_button.setChecked(bool(snap["freeze_robot_heartbeat"])); self.freeze_robot_button.blockSignals(False)
        self.lose_plc_button.blockSignals(True); self.lose_plc_button.setChecked(bool(snap["force_plc_heartbeat_loss"])); self.lose_plc_button.blockSignals(False)
        for source, button in self._fault_buttons.items():
            button.blockSignals(True); button.setChecked(bool(snap["fault_sources"][source])); button.setEnabled(not test_session_active); button.blockSignals(False)
        self.freeze_robot_button.setEnabled(not test_session_active)
        self.lose_plc_button.setEnabled(not test_session_active)
        self.start_server_button.setEnabled(not self.server.running)
        self.stop_server_button.setEnabled(self.server.running)
        self._update_register_table(self.command_table, snap["command_registers"])
        self._update_register_table(self.status_table, snap["status_registers"])
        text = "\n".join(snap["events"])
        if self.event_log.toPlainText() != text:
            self.event_log.setPlainText(text)

    @staticmethod
    def _update_register_table(table: QTableWidget, values: list[int]) -> None:
        for row, value in enumerate(values):
            table.item(row, 1).setText(str(value))
            table.item(row, 2).setText(f"0x{value:04X}")

    def shutdown(self) -> None:
        if self._shutdown_complete:
            return
        self._commit_active_point_editor()
        self._save_configuration()
        self.control_server.stop()
        self.server.stop()
        self.model.stop_runtime()
        self._shutdown_complete = True

    def closeEvent(self, event: Any) -> None:
        self.shutdown()
        event.accept()


def run_gui(model: RobotModel, store: ConfigStore) -> int:
    app = QApplication.instance() or QApplication([])
    app.setStyle("Fusion")
    app.setStyleSheet(STYLE)
    window = MainWindow(model, store)
    app.aboutToQuit.connect(window.shutdown)
    window.show()
    return app.exec()
