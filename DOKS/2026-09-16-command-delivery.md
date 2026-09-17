# Доставка команд и настроек HMI — 16.09.2026

В исходниках закрыты три найденных механизма: перезапись 13 настроек между
чтением и публикацией PLC; потеря Stop проверки точки при read/clear; слияние
и пропуск сетевых импульсов разовых команд. На работающий PLC изменения
не загружались. Проверка компиляции и поведения в CODESYS остаётся за владельцем проекта.

## Изменение поведения

1. 13 настроек используют отдельные index/value/IssuedAt/Seq и Ack/Result.
   Применённые значения принадлежат PLC, опубликованы read-only и не являются
   буфером запроса. Запрет, неверное значение или просрочка дают отказ и W28
   с эффектом WARNING; такой запрос не исполнится после снятия запрета.
2. Все 121 разовых сигнала, доступных через gateway, переведены с сетевого
   TRUE/150 мс/FALSE на отдельные счётчики. PLC формирует импульс на один скан,
   оставляет обязательный низкий скан и подтверждает сохранённый Seq в PublishHmi.
   Сценарные инъекции используют внутренний pending-буфер и не стираются новым диспетчером.
3. Stop проверки точки проходит по отдельному счётчику, без read/clear входного
   флага. Также независимы Cell Stop, Robot Stop и Stop обоих магазинов.
4. Общие буферы параметров защищены до записи и до Ack, в том числе после timeout
   или перезапуска gateway. Конкурентное обращение отклоняется явно. Неподтверждённые
   запросы не перезаписываются, автоматических повторов и очереди движений нет.
5. PLC проверяет возраст запроса по своим часам: максимум 3000 мс, с учётом
   переполнения TIME. Просроченный запрос подтверждается отказом без исполнения.
   Gateway ждёт подтверждение 5000 мс; timeout означает неизвестный результат.
6. Для разовой команды Ack подтверждает прохождение через цикл обработчиков,
   а не успешное технологическое выполнение. Проверки владельцев и их предупреждения
   сохраняются; операция подтверждается штатными статусами. Журнал добавляет путь/Seq
   в details.plcReceipt и явно различает применение настройки и обработку запроса.

Удерживаемые Jog, heartbeat, уровневые инъекции неисправностей, тестовый Abort
и существующие каналы редактора точек/режима сохраняют свои контракты. Эта правка
не является аудитом всех автоматов и всех переменных приложения.

## Фактически выполненные проверки

- `npm run test:gateway`: **105/105**.
- `robot_simulator/.venv/Scripts/python.exe -m pytest tests` из robot_simulator: **108/108**.
- `npm run build`: успешно; прежнее предупреждение Vite о крупном JS chunk.
- Синтаксис Node server/contract проверен, новые модули загружены тестами.
- Статическая сверка 12 изменённых/новых ST-файлов: баланс IF/CASE/FOR/WHILE;
  контракт W28, эффект WARNING, вызов FB; отсутствие PLC-записей в request-теги;
  соответствие всех 121 ID и порядка вызовов; отсутствие raw-записей gateway
  в защищённые BOOL/применённые настройки и таймеров импульсов 150 мс.
- 30 новых Python-проверок исполняют ограниченные решения из реального ST,
  включая скановые границы, повторные фронты, внутреннюю инъекцию, 13 настроек,
  срок действия и переполнение часов. Это не эмуляция библиотек PLC и не компиляция CODESYS.
- 14 новых Node-проверок проверяют канал и фактические ветви gateway: подтверждение,
  конкурентность, отказ, неизвестный результат записи, restart, отдельный Stop,
  все разовые маршруты и 13 настроек.

Первые два запуска интеграционного mobile-login теста завершились его 10-секундным
таймаутом старта gateway. Изолированные запуски исходной и новой версий на временных
базах прошли (4.3 и 1.8 с), затем отдельный интеграционный тест и полный набор прошли.
Таймаут теста не увеличивался. Все тестовые gateway использовали временные базы и
недоступный OPC UA endpoint localhost:1; рабочий gateway не перезапускался.
Журнал cell-events.sqlite открывался только для чтения.

## Применение владельцем проекта

Обновить PLC-исходники и gateway согласованно. В PLC добавлены методы
ReadHmiCommands и IsHmiCommandFresh; нужны новые OPC UA символы и обновлённые права
старых командных/статусных тегов. Старые прямые записи импульсных BOOL больше не API.
Нельзя оставлять старую версию gateway с новой PLC-логикой или наоборот.

После самостоятельной компиляции и загрузки в CODESYS проверить публикацию
Seq/Ack/IssuedAt/Result, исходный сценарий двух восстановлений, изменение каждой
группы настроек, быстрые повторные команды и Stop при незавершённом другом запросе.
Затем проверить потерю/восстановление связи и отсутствие отложенного выполнения
просроченного запроса. Эти проверки на PLC в рамках данной работы не выполнялись.
Бинарный .project, сгенерированные XML, журнал и рабочие базы не изменялись;
Git commit/push не выполнялись.

## Файлы

- `DOKS/02-opc-ua.md`
- `DOKS/10-cell-event-log.md`
- `DOKS/15-equipment-error-reset-table.md`
- `DOKS/16-cell-warnings.md`
- `DOKS/20-smoke-and-integration-test-catalog.md`
- `Portal_robot/Device/application/FB/FB_CELL_MANAGER/FB_CELL_MANAGER.st`
- `Portal_robot/Device/application/GVL/GVL_HMI.gvl.st`
- `Portal_robot/Device/application/PLC_PRG.IsHmiCommandFresh.st`
- `Portal_robot/Device/application/PLC_PRG.PublishHmi.st`
- `Portal_robot/Device/application/PLC_PRG.ReadHmiCommands.st`
- `Portal_robot/Device/application/PLC_PRG.ReadHmiInputs.st`
- `Portal_robot/Device/application/PLC_PRG.RunCellControl.st`
- `Portal_robot/Device/application/PLC_PRG.RunTestControl.st`
- `Portal_robot/Device/application/PLC_PRG.st`
- `Portal_robot/Device/application/ST/ST_HMI/ST_AXIS_HMI_COMMAND.st`
- `Portal_robot/Device/application/ST/ST_MAGAZINE/ST_MAGAZINE_HMI_COMMAND.st`
- `Portal_robot/Device/application/ST/ST_MULTI_TYPE/ST_MULTI_TYPE_COMMAND.st`
- `robot_simulator/tests/test_hmi_command_contract.py`
- `visu/alarm-catalog.json`
- `visu/gateway/acknowledged-command.mjs`
- `visu/gateway/acknowledged-command.test.mjs`
- `visu/gateway/command-contract.mjs`
- `visu/gateway/server.mjs`
- `visu/package.json`
- `DOKS/2026-09-16-command-delivery.md` — этот отчёт.
- `DOKS/2026-09-16-cell-mode-reset-race.md` — отметка о последующем закрытии оставшихся гонок.
