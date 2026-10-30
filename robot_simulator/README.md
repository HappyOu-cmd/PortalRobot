# SC-500 Modbus TCP Robot Simulator

Python-симулятор внешнего контроллера робота для проекта Portal Robot. Он
реализует проектный контракт `1001–1117` версии 3 и используется до появления
реального INOVANCE SC-500.

## Установка и запуск

```powershell
cd "C:\Users\KOKSHAROV IR\Desktop\Project\Portal robot\robot_simulator"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\run_simulator.bat
```

Окно автоматически запускает Modbus Server. По умолчанию он слушает
`0.0.0.0:502`, Unit ID `1`. В PLC следует указать IPv4 компьютера, на котором
запущен симулятор. Windows Firewall может запросить разрешение входящих TCP-
соединений.

Автоматические тесты используют этот же запущенный экземпляр. Второй Modbus-
сервер не создаётся. Локальный управляющий API слушает только
`127.0.0.1:8765`; через него Test Runner временно включает автоматический режим,
FAST-профиль и тестовые аварии. Во время прогона соответствующие элементы
локального пульта блокируются.

Запуск без графического пульта:

```powershell
.\run_simulator.bat --headless --host 0.0.0.0 --port 502 --unit-id 1
```

## Поведение

- `Автоматический`: выставляет Auto, Remote, Drives, Homed и Ready; принимает PLC-команды.
- `Ручной`: внешние команды подтверждаются `AckSeq`, но отклоняются с `ResultCode=4`; движение и захваты доступны только с локального Python-пульта.
- `Остановлен`: приводы и Ready выключены, команды PLC отклоняются.
- Новая команда принимается только при `Execute=1` и новом ненулевом `CommandSeq`.
  После приёма спад `Execute` не отменяет действие. Итог удерживается до снятия
  `Execute`; повтор требует нового `CommandSeq`.
- Stop движения выполняет jerk-limited торможение. Stop захвата или переворота
  ждёт завершения действия. Оба варианта заканчиваются `STOPPED`, результатом 8
  и фиксируемой аварией.
- Точки станков и геометрия магазина принадлежат симулятору и сохраняются в
  `config.json`. Изменения сохраняются сразу после подтверждения значения и ещё
  раз при закрытии окна. `safe_z` и `change_z` задают signed-смещение от
  `base_z`; целевая координата считается как `base_z + смещение` (минус — вверх). PLC передаёт
  `CommandCode`, `MagazineId` и `ActiveSlot`.

## Проверка

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Тесты проверяют handshake, запрет повторного sequence, Stop/Reset, магазинную
геометрию и кодирование signed DINT. Файл `config.json`, виртуальное окружение и
кэши не входят в исходники.

## Поиск ошибок алгоритма без контроллера

Пакет `robot_simulator.plc_model` исполняет текущие ST-исходники менеджера
ячейки, магазинов и ГК в Python. Компиляция CODESYS, GUI симулятора, gateway,
OPC UA и Modbus для этого не запускаются. Движение робота, обслуживание
станка и механический обмен палет представлены ограниченной моделью среды;
это не проверка оборудования и не полный эмулятор CODESYS.

```powershell
# Фиксированные проверки модели и воспроизведения найденных дефектов:
.\.venv\Scripts\python.exe -m pytest tests/test_offline_cell_model.py

# Перебор ограниченных матриц и последовательностей с повторяемым seed:
.\.venv\Scripts\python.exe -m robot_simulator.plc_model.audit --seed 20261029 --random-cases 64 --report "$env:TEMP/portal-cell-model-audit.json"

# Короткое воспроизведение одного дефекта:
.\.venv\Scripts\python.exe -m robot_simulator.plc_model.audit --reproduce F001
```

У аудитора код возврата `1` означает найденное нарушение, включая уже описанное.
После исправлений F001–F006 воспроизведения выполняются как обычные тесты,
без xfail. Любое повторное нарушение возвращает ошибку проверки.
JSON содержит seed, входные данные, короткие трассы и SHA-256 ST-файлов.

Границы модели, результаты и причины дефектов:
[DOKS/27-offline-cell-model-audit.md](../DOKS/27-offline-cell-model-audit.md).

## Аварии и восстановление без PLC

`RecoveryCell` расширяет модель настоящими `FB_ROBOT`, Motion/Point Manager,
захватами, тремя `FB_MACHINE`, их симуляторами и инжекторами, полным
`FB_TWO_PALLET` с моделью пневматики. Исполняются также текущие фрагменты
очерёдности сброса RunMotion и публикации/каскада RunMagazine. Приводы и
геометрия движения представлены ограниченной обратной связью; это не проверка
SoftMotion, электрической схемы или столкновений. Safety проверяется отдельно.

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_offline_recovery_model.py
.\.venv\Scripts\python.exe -m robot_simulator.plc_model.recovery_audit --report "$env:TEMP/portal-recovery-audit.json"
.\.venv\Scripts\python.exe -m robot_simulator.plc_model.recovery_audit --reproduce F006
```

Набор проверяет один тип изделия, оба режима магазинов, ошибки и пары причин
Safety, таймауты станков, захваты/точки, прерывание обмена палет, перестановки
Stop/Reset/устранения причины, возврат к HOME и новый Start. Проверки отдельных
битов из заранее заданного ERROR отделены от инъекции причин в достижимых
операциях. Воспроизведения F004–F006 проходят без xfail после исправления ST.
Код возврата аудитора `1` означает воспроизведённый дефект; JSON содержит трассы
и SHA-256 ST. Рабочая база журнала и контроллер при запуске этих команд не нужны.

Результаты, ограничения и направления исправления:
[DOKS/28-offline-recovery-audit.md](../DOKS/28-offline-recovery-audit.md).

Дополнительные проверки исправлений: `test_cell_routing_fixes.py`,
`test_machine_input_boundary.py`, `test_coordinated_reset.py`,
`test_reset_pair_boundaries.py`.
`MachineInputRig` исполняет весь RunMachines и фактическую HMI-настройку
инъекции; `RecoveryCell` исполняет также BuildRobotResetDependencies.
Проверяются физический/виртуальный Alarm, источник таймаутов, выбор обоих
магазинов до Start, ожидание оператора, освобождение команды после отказа,
единая ограниченная попытка Reset станков/магазинов/робота/ГК, отмена и
повтор только по новому запросу. Текущий статус и воспроизведения:
[реестр дефектов](../DOKS/29-cell-defect-register.md),
[план и фактическая приёмка](../DOKS/30-cell-defect-fix-plan.md).
