from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QVBoxLayout, QWidget


class StatusPill(QFrame):
    def __init__(self, title: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("statusPill")
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 6)
        layout.setSpacing(7)
        self.dot = QLabel("●")
        self.dot.setObjectName("statusDot")
        self.title = QLabel(title)
        self.title.setObjectName("statusTitle")
        self.value = QLabel("—")
        self.value.setObjectName("statusValue")
        layout.addWidget(self.dot)
        layout.addWidget(self.title)
        layout.addStretch()
        layout.addWidget(self.value)
        self.set_state(False)

    def set_state(self, active: bool, value: str | None = None, warning: bool = False) -> None:
        color = "#f59e0b" if warning else ("#34d399" if active else "#64748b")
        self.dot.setStyleSheet(f"color: {color};")
        if value is not None:
            self.value.setText(value)


class Section(QFrame):
    def __init__(self, title: str, subtitle: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("section")
        outer = QVBoxLayout(self)
        outer.setContentsMargins(16, 14, 16, 16)
        outer.setSpacing(12)
        title_label = QLabel(title)
        title_label.setObjectName("sectionTitle")
        outer.addWidget(title_label)
        if subtitle:
            subtitle_label = QLabel(subtitle)
            subtitle_label.setWordWrap(True)
            subtitle_label.setObjectName("sectionSubtitle")
            outer.addWidget(subtitle_label)
        self.body = QVBoxLayout()
        self.body.setSpacing(10)
        self.body.setAlignment(Qt.AlignmentFlag.AlignTop)
        outer.addLayout(self.body)


def set_header(label: QLabel) -> None:
    label.setAlignment(Qt.AlignmentFlag.AlignVCenter)
    label.setObjectName("pageHeader")
