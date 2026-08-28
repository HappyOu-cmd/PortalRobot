# Документация Portal Robot

В проекте оставлена одна папка документации: `DOKS` в корне
`C:\Users\KOKSHAROV IR\Desktop\Project\Portal robot`. Предыдущая подпапка
документации внутри `visu` объединена с ней и больше не используется.

| Файл | Когда читать |
| --- | --- |
| [01-visual-elements.md](01-visual-elements.md) | Новый элемент, карточка, область экрана или 3D-объект |
| [02-opc-ua.md](02-opc-ua.md) | Новый тег из PLC или привязка статуса/команды к HMI |
| [03-alarms-warnings.md](03-alarms-warnings.md) | Новая авария или предупреждение в журнале и интерфейсе |
| [04-run-and-ip.md](04-run-and-ip.md) | Запуск HMI/gateway и изменение IP PLC или веб-интерфейса |
| [05-architecture.md](05-architecture.md) | Состав ячейки, связи CODESYS, поток данных и структура visu |
| [06-token-efficient-workflow.md](06-token-efficient-workflow.md) | Короткие задачи, выбор модели и экономия токенов |
| [07-error-simulation-opc-ua-web.md](07-error-simulation-opc-ua-web.md) | Теги эмуляции ошибок для OPC UA, gateway и web |
| [08-sc500-modbus-register-map.md](08-sc500-modbus-register-map.md) | Контракт PLC ↔ SC-500, handshake и справочная карта Huacheng |
| [09-python-robot-modbus-simulator.md](09-python-robot-modbus-simulator.md) | Установка и проверка Python-симулятора SC-500 по Modbus TCP |
| [10-cell-event-log.md](10-cell-event-log.md) | Постоянный журнал работы ячейки, источники и SQLite-хранилище |
| [11-automated-cell-testing.md](11-automated-cell-testing.md) | Быстрый запуск теста, сценарии PLC Runtime и стенд SC-500 |
| [12-sc500-controller-commissioning.md](12-sc500-controller-commissioning.md) | Поэтапная реализация и проверка программы реального SC-500 |
| [13-indexed-conveyor-plan.md](13-indexed-conveyor-plan.md) | Зафиксированные майлстоуны по второму магазину и индексному конвейеру |
| [14-operator-shifts-statistics.md](14-operator-shifts-statistics.md) | Настраиваемые смены, интервалы операторов и штатная остановка при выходе |
| [15-equipment-error-reset-table.md](15-equipment-error-reset-table.md) | Единая карта аварий, условий сброса и сообщений журнала |
| [16-cell-warnings.md](16-cell-warnings.md) | Реестр предупреждений ячейки |

## Карта правил

- Общие правила: [корневой AGENTS.md](../AGENTS.md).
- PLC: [Portal_robot/Device/application/AGENTS.md](../Portal_robot/Device/application/AGENTS.md).
- HMI: [visu/AGENTS.md](../visu/AGENTS.md).

Для сквозной задачи сначала прочитать архитектуру, затем только руководство,
соответствующее текущему результату. Подробные исходники проекта находятся в
`Portal_robot/Device/application` и `visu`; документация не дублирует код.
