# Архитектура проекта Portal Robot

Этот файл — карта проекта для сквозных изменений. В текущей конфигурации:

- **3 станка**: `MACHINE_1..3`, по одному `FB_MACHINE` и
  `FB_MACHINE_SIMULATION` на каждый;
- **1 портальный робот** с осями X/Y/Z, одной группой осей и двумя захватами;
- **2 индексных магазина**; у каждого Zone 1/2 по 12 × 10 слотов и Zone 3 на 6 × 10 слотов;
- **1 автоматическая ячейка**, которой управляет универсальный `FB_CELL_MANAGER`;
- **1 журнал аварий и предупреждений**, собираемый `FB_ALARM_MANAGER` из 13
  источников.

## Общая схема

```text
PLC_PRG / FB_*
  -> GVL_HMI
  -> OPC UA server PLC
  -> visu/gateway/server.mjs
  -> WebSocket snapshot
  -> visu/src/plc/client.ts
  -> CellState / PlcRuntimeInfo
  -> React-компоненты и Three.js-сцена
```

Команда идёт обратно через `plcClient.send()` и явный `commandMap` gateway.
PLC повторно проверяет режим, состояние механизма и разрешения безопасности.

Автоматические тесты используют тот же путь: HMI хранит сценарии в SQLite gateway,
gateway запускает Python runner, runner управляет реальным PLC Runtime через
служебный WebSocket. Для `Python Modbus` runner через локальный test-control API
управляет уже запущенным экземпляром симулятора; второй Modbus Server не
создаётся. Отдельная среда `NORMAL / SIMULATION / SC500_BENCH` не заменяет выбор
интерфейса `SoftMotion / Modbus TCP`.

## CODESYS: программа и связи FB

Точка входа — `Portal_robot/Device/application/PLC_PRG.st`. В ней создаются и
вызываются:

| Блок | Ответственность и связи |
| --- | --- |
| `FB_AXIS` ×5 | Оси X, Y, Z и две независимые оси магазинов; последние не входят в группу XYZ |
| `FB_AXIS_GROUP` | Группа XYZ; выдаёт готовность и фактические координаты |
| `FB_MOTION_MANAGER` | Движение по именованным точкам через группу осей |
| `FB_POINT_MANAGER` | Хранит и выдаёт точки станков и магазина |
| `FB_MACHINE` ×3 | Состояния, двери, патрон, цикл и команды каждого станка |
| `FB_MACHINE_SIMULATION` ×3 | Моделирует I/O станков и возвращает его в `FB_MACHINE` |
| `FB_MAGAZINE` ×2 | Независимые зоны, индексирование и пошаговый автомат TAKE/PUT/CHANGE/RETURN_BLANK через `MAGAZINE_SAFE`, `MAGAZINE_CHANGE`, `MAGAZINE_IN_SLOT` |
| `FB_ROBOT` | Координирует движение, два захвата, станки, магазин и Modbus |
| `FB_ROBOT_MODBUS` | Modbus TCP Client: FC03/FC16, heartbeat, `CommandSeq/AckSeq`, декодирование SC-500 |
| `FB_CELL_MANAGER` | Единый автоматический цикл для 1–3 типов: выбирает совместимый станок и формирует команды роботу, станкам и магазину |
| `FB_ALARM_MANAGER` | Собирает первичные аварии и предупреждения в журнал |

Связи цикла:

1. `GVL_HMI` принимает команды ячейки, робота, станков и магазина.
2. `PLC_PRG` передаёт их в `GVL_CELL_CONTROL`, `FB_CELL_MANAGER`, `FB_MACHINE`,
   два `FB_MAGAZINE` и `FB_ROBOT`.
3. `FB_CELL_MANAGER` использует статусы трёх станков, робота, двух магазинов и
   готовность осей, затем формирует команды автоматического обслуживания.
4. `FB_ROBOT` получает команды трёх станков, магазина и ячейки, использует
   `FB_MOTION_MANAGER`, `FB_POINT_MANAGER` и `FB_AXIS_GROUP`.
5. `FB_MACHINE_SIMULATION` возвращает I/O-статусы в соответствующие станки.
6. Статусы, диагностика и ошибки копируются в `GVL_HMI`: `stCell*`, `stRobot*`,
   `astMachine*`, `astMagazine*`, `stAlarm*` и массивы трёх зон.

Журнал имеет 16 источников: ячейка, робот, станки 1–3, два магазина, две их оси,
оси X/Y/Z, группа осей, motion manager, point manager и gripper. Каскадные ошибки не должны
дублировать первопричину.

## Структура PLC

```text
Portal_robot/Device/application/
|-- FB/       функциональные блоки и методы
|-- GVL/      глобальные переменные, включая GVL_HMI
|-- ST/       DUT, структуры и перечисления
|-- PLC_PRG.st
|-- Symbols.xml
`-- Task Configuration.xml
```

Python-симулятор внешнего контроллера находится в `robot_simulator`. Он не
входит в цикл PLC: отдельный `RobotModel` исполняет команды и формирует обратную
связь, `RobotModbusServer` публикует holding registers, а PySide6-интерфейс
имитирует локальный пульт робота. Локальный `RobotControlApiServer` предоставляет
runner эксклюзивную lease-сессию для FAST и аварийных инъекций. Конфигурация
точек и геометрии магазина принадлежит симулятору и сохраняется в его
`config.json`.

Режим робота хранится в RETAIN-GVL и выбирает единственный источник обратной
связи. В SoftMotion координаты и готовность поступают от группы XYZ; в Modbus —
от `FB_ROBOT_MODBUS`. Технологические блоки в обоих режимах используют общий
`ST_ROBOT_COMMAND` и `ST_ROBOT_STATUS`. Карта внешнего контракта описана в
[08-sc500-modbus-register-map.md](08-sc500-modbus-register-map.md).

Для магазинного движения `ST_ROBOT_COMMAND` содержит пару `uiMagazineId + iActiveSlot`.
В SoftMotion единственный обработчик команды рассчитывает XYZ по базе выбранного
магазина, а в Modbus контроллер робота делает тот же расчёт. Высокоуровневая операция
магазина никогда не передаётся роботу одной командой.

Перед изменением FB нужно прочитать его DUT, GVL, методы, вызов в `PLC_PRG.st` и
потребителей его статусов. Бинарный `.project` и XML вручную не редактируются;
экспорт Codescribe хранится вместе с исходниками.

## Структура визуализации

```text
visu/
|-- gateway/server.mjs       OPC UA browse/read/write и WebSocket
|-- src/App.tsx              компоновка, страницы и локальное состояние
|-- src/components/ui        общие UI-компоненты
|-- src/components/machine   карточки станков
|-- src/components/magazine  матрица и статистика магазина
|-- src/components/CellViewport.tsx  контейнер 3D-сцены
|-- src/model                CellState, layout, defaults, scenarios
|-- src/plc/client.ts        snapshot -> модель HMI, команды и аварии
|-- src/styles               тема и глобальные стили
|-- src/three                portal, machines, magazine и эффекты
`-- src/assets               GLB, логотипы и текстуры
```

`App.tsx` управляет страницами `monitoring`, `machines`, `robot`, `magazine`,
`manual`, `events`, `alarms`, `settings` и нижними областями `cell`, `machines`,
`robot`, `magazine`. `CellState` содержит один `RobotState`, три `MachineState`
и два `MagazineData` с независимыми Zone 1/2/3 и статусами приводов.

`gateway/server.mjs` динамически ищет `GVL_HMI`, публикует snapshot и разрешает
только команды из `commandMap`. `client.ts` преобразует числовые коды в текст,
состояния и `PlcAlarmEvent`; React передаёт результат карточкам и экранам.

Пользовательские учётные записи и серверные cookie-сессии хранятся gateway в
отдельной SQLite-базе. Без действующей сессии обычный WebSocket работает только
для просмотра телеметрии и отклоняет управляющие команды. Управление
пользователями доступно администратору; см.
[11-user-accounts.md](11-user-accounts.md).

Смысловая история работы ячейки хранится gateway в SQLite на компьютере. Она
включает переходы оборудования, действия оператора, аварии и события связи;
см. [10-cell-event-log.md](10-cell-event-log.md).
Физический факт выпуска формирует PLC: магазин увеличивает монотонный счётчик
после подтверждённой укладки готовой детали. Gateway превращает приращения
счётчика в исторические события, привязывает их к авторизационным интервалам и
рассчитывает план/факт; см. [14-operator-shifts-statistics.md](14-operator-shifts-statistics.md).
`CellViewport` создаёт `cellScene`, которая обновляет один портал, три модели
станков и два индексных магазина без пересоздания сцены на каждый рендер.
Gateway дополнительно формирует из `lrActualX/Y/Z` единый координатный кадр с
локальным номером и нормализованным `sourceTimestamp` OPC UA. 3D-портал
воспроизводит очередь таких кадров с отставанием 250 мс и критически затухающим
фильтром положения; это сглаживание не участвует в управлении, авариях и PLC.

## Где менять типовые вещи

| Результат | Основные места |
| --- | --- |
| Новый элемент или карточка | `visu/src/components`, `App.tsx`, Storybook |
| Новый PLC-статус | `GVL_HMI` → `gateway/server.mjs` → `src/plc/client.ts` → модель/компонент |
| Новая авария HMI | `src/plc/client.ts`, `AlarmScreen`, сводка аварий |
| Новая 3D-деталь | `src/assets/models`, `src/three`, `CellViewport` |
| IP и запуск | `visu/gateway/server.mjs`, переменные окружения, `package.json` |

## Документы

- [Элементы визуализации](01-visual-elements.md)
- [OPC UA](02-opc-ua.md)
- [Аварии и предупреждения](03-alarms-warnings.md)
- [Запуск и IP](04-run-and-ip.md)
- [Экономная работа с Codex](06-token-efficient-workflow.md)
- [Аудит читаемости PLC](07-plc-readability-audit.md)
- [Python-симулятор SC-500](09-python-robot-modbus-simulator.md)
- [Учётные записи HMI](11-user-accounts.md)
- [Ошибки оборудования и условия сброса](15-equipment-error-reset-table.md)
