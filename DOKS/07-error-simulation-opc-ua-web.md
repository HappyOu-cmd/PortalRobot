# Эмуляция ошибок: теги для OPC UA и web

Краткий handoff для агента, который будет подключать уже реализованные PLC-инжекторы
к OPC UA, gateway и web-интерфейсу. Логические пути ниже начинаются с
`GVL_HMI.`; фактический NodeId и представление индексов массивов нужно брать из
обновлённого browse/export CODESYS, а не угадывать и не править `Symbols.xml`
вручную. Индексы `[1..3]`: оси X/Y/Z или станки 1/2/3.

## Запись из web в PLC

Сначала включить удерживаемый переключатель диагностического режима:

- `GVL_HMI.xErrorSimulationEnable` — удерживаемый BOOL.

Одноразовые команды; в `visu/gateway/server.mjs` добавить их в `commandMap` с
`pulse: true`:

- `GVL_HMI.xCellReset` — единственная операторская команда «Сбросить аварии»;
  PLC передаёт импульс всем владельцам аварий, каждый FB принимает или отклоняет
  его по собственным условиям;
- `GVL_HMI.axSimAxisJogConflict[1..3]`;
- `GVL_HMI.xSimAxisGroupError`;
- `GVL_HMI.xSimRobotWrongAction`;
- `GVL_HMI.xSimCellBothGrippers`;
- `GVL_HMI.xSimPointXOutOfLimit`, `xSimPointYOutOfLimit`,
  `xSimPointZOutOfLimit`, `xSimPointInvalidVelocity`;
- `GVL_HMI.xSimMagazineWrongOperation`, `xSimMagazineNoBlank`,
  `xSimMagazineNoFreeSlot`, `xSimMagazineInvalidSlot`,
  `xSimMagazineSlotContent`, `xSimMagazineGeometry`;
- `GVL_HMI.axMachineSimReset[1..3]` — отдельный сброс источника аварии
  `FB_MACHINE_SIMULATION`.

Удерживаемые BOOL-переключатели; gateway должен записывать выбранное значение
`TRUE/FALSE`, без `pulse: true`:

- захват: `GVL_HMI.xSimGripper1Fault`, `xSimGripper2Fault`,
  `xSimGripperRotationFault`, `xSimGripperGlobalFault`;
- станки: `GVL_HMI.axMachineSimAlarm[1..3]`,
  `axMachineSimDoorFault[1..3]`, `axMachineSimChuckFault[1..3]`;
- TIMEOUT станков: `GVL_HMI.axMachineTimeoutRobotMove[1..3]`,
  `axMachineTimeoutRobotAction[1..3]`, `axMachineTimeoutRobotRelease[1..3]`,
  `axMachineTimeoutDoorOpen[1..3]`, `axMachineTimeoutDoorClose[1..3]`,
  `axMachineTimeoutChuckOpen[1..3]`, `axMachineTimeoutChuckClose[1..3]`,
  `axMachineTimeoutCycleStart[1..3]`.

Настройки времени симуляторов записываются как `TIME` (web передаёт секунды,
gateway преобразует их в миллисекунды и записывает OPC UA-типом `Int64`):

- `GVL_HMI.tMachineCycleTime[1..3]` — время обработки станков 1/2/3;
- `GVL_HMI.tMachineDoorOpenTime`, `tMachineDoorCloseTime`;
- `GVL_HMI.tMachineChuckOpenTime`, `tMachineChuckCloseTime`;
- `GVL_HMI.tGripper1OpenTime`, `tGripper1CloseTime`;
- `GVL_HMI.tGripper2OpenTime`, `tGripper2CloseTime`;
- `GVL_HMI.tGripperChangeTime` — время смены рабочего захвата.

## Чтение статуса в web

Обязательный общий статус:

- `GVL_HMI.xErrorSimulationEnabled` — фактическое состояние режима, именно его
  показывать как подтверждение PLC;
- `GVL_HMI.stCellStatus.xResetAllowed` — `TRUE`, только если существует хотя бы
  одна авария и все активные владельцы общей команды готовы принять один импульс
  `xCellReset`; использовать только для визуального приглушения единственной
  кнопки общего сброса. Защёлки `FB_MACHINE_SIMULATION` обслуживаются отдельной
  командой `axMachineSimReset` и в эту агрегацию не входят.

Статусы инжекторов:

- `GVL_HMI.astAxisFaultStatus[1..3]`;
- `GVL_HMI.stAxisGroupFaultStatus`;
- `GVL_HMI.stRobotFaultStatus`;
- `GVL_HMI.stCellFaultStatus`;
- `GVL_HMI.stGripperFaultStatus`;
- `GVL_HMI.stPointFaultStatus`;
- `GVL_HMI.stMagazineFaultStatus`;
- `GVL_HMI.astMachineFaultStatus[1..3]`.

Для каждого `ST_FAULT_INJECTION_STATUS` читать листья `xAllowed`, `xActive`,
`xBusy`, `xResetAllowed`, `xRejected`, `udiRejectSequence`. `xRejected` живёт
один цикл PLC, поэтому для надёжного сообщения об отклонённой попытке web должен
отслеживать изменение `udiRejectSequence`. `xAllowed` используется только для
визуального приглушения кнопки: web не дублирует технологические запреты и не
подменяет проверку в PLC.

Для отображения результата инъекции подключать нужные ветви диагностики:

- оси/группа/робот: `astAxisStatus/Diag/Error[1..3]`,
  `stAxisGroupStatus/Diag/Error`, `stRobotStatus/Diag/Error`;
- захват: `stGripperDiag`, `stGripperError`;
- точка: `stPointManagerStatus/Diag/Error`;
- ячейка: `stCellStatus/Diag/Error`;
- магазин: `stMagazineStatus/Diag/Error`;
- станок: `astMachineStatus/Diag/Error[1..3]`,
  `astMachineSimDiag/SimError[1..3]`, `astMachineIoStatus[1..3]`,
  `astMachineRawIoStatus[1..3]`, `astMachineTimeouts[1..3]`;
- общий журнал: `stAlarmStatus`, `astAlarmEvent[1..100]`.

`astMachineIoStatus` содержит обратную связь после инжектора, а
`astMachineRawIoStatus` — до него; их сравнение полезно на диагностическом
экране. После снятия удерживаемой неисправности станка сначала послать импульс
`axMachineSimReset[i]` для сервисного сброса источника симулятора, затем при
оставшейся защёлкнутой технологической ошибке использовать только общий
`xCellReset`. Теги `axMachineReset[i]` и `xRobotReset` сохранены для обратной
совместимости, но отдельные операторские кнопки для них в web не создавать.
Исправные блоки общий импульс игнорируют без предупреждения; предупреждение
формирует только FB с собственной активной ошибкой, если его условия сброса не
выполнены.

Перед web-реализацией: скомпилировать PLC в CODESYS, обновить Symbol
Configuration/export, проверить точные OPC UA-пути, затем выполнить цепочку из
`DOKS/02-opc-ua.md`. Агенту, меняющему `visu`, предварительно прочитать
`visu/AGENTS.md`.
