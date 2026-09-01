import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { PlcCommand } from '../../plc/client';
import { readBool, readInjectionStatus } from '../../model/faultSimulation';
import {
  FaultModeBanner,
  FaultPanelHeading,
  FaultStatusLine,
  FaultToggle,
  InjectionButton,
} from './FaultSimulationControls';

type Send = (command: PlcCommand) => void;

const pulseDefinitions = {
  axisGroup: 'fault.axisGroup',
  robotWrongAction: 'fault.robotWrongAction',
  cellBothGrippers: 'fault.cellBothGrippers',
  pointX: 'fault.pointXOutOfLimit',
  pointY: 'fault.pointYOutOfLimit',
  pointZ: 'fault.pointZOutOfLimit',
  pointVelocity: 'fault.pointInvalidVelocity',
  magazineWrongOperation: 'fault.magazineWrongOperation',
  magazineNoBlank: 'fault.magazineNoBlank',
  magazineNoFreeSlot: 'fault.magazineNoFreeSlot',
  magazineInvalidSlot: 'fault.magazineInvalidSlot',
  magazineSlotContent: 'fault.magazineSlotContent',
  magazineGeometry: 'fault.magazineGeometry',
} as const;

const machineToggles = [
  ['safetyDoorOpen', 'Операторская дверь открыта', 'axMachineSimSafetyDoorOpen'],
  ['machineAlarm', 'Авария станка', 'axMachineSimAlarm'],
  ['doorFault', 'Неисправность люка', 'axMachineSimDoorFault'],
  ['chuckFault', 'Неисправность патрона', 'axMachineSimChuckFault'],
] as const;

const timeoutToggles = [
  ['timeoutRobotMove', 'Движение робота', 'axMachineTimeoutRobotMove'],
  ['timeoutRobotAction', 'Действие захвата', 'axMachineTimeoutRobotAction'],
  ['timeoutRobotRelease', 'Освобождение интерфейса', 'axMachineTimeoutRobotRelease'],
  ['timeoutDoorOpen', 'Открытие люка', 'axMachineTimeoutDoorOpen'],
  ['timeoutDoorClose', 'Закрытие люка', 'axMachineTimeoutDoorClose'],
  ['timeoutChuckOpen', 'Разжим патрона', 'axMachineTimeoutChuckOpen'],
  ['timeoutChuckClose', 'Зажим патрона', 'axMachineTimeoutChuckClose'],
  ['timeoutCycleStart', 'Запуск обработки', 'axMachineTimeoutCycleStart'],
] as const;

function pulse(send: Send, command: string, machine?: number) {
  send({ command, ...(machine ? { machine } : {}) });
}

export function FaultInjectionPanel({ values, online, send, onClose, className }: {
  values: Record<string, unknown>;
  online: boolean;
  send: Send;
  onClose: () => void;
  className?: string;
}) {
  const [machine, setMachine] = useState(1);
  const requested = readBool(values, 'xErrorSimulationEnable');
  const enabled = readBool(values, 'xErrorSimulationEnabled');
  const axisGroup = readInjectionStatus(values, 'stAxisGroupFaultStatus');
  const robot = readInjectionStatus(values, 'stRobotFaultStatus');
  const cell = readInjectionStatus(values, 'stCellFaultStatus');
  const gripper = readInjectionStatus(values, 'stGripperFaultStatus');
  const point = readInjectionStatus(values, 'stPointFaultStatus');
  const magazine = readInjectionStatus(values, 'stMagazineFaultStatus');
  const machineStatus = readInjectionStatus(values, `astMachineFaultStatus[${machine}]`);

  const setHeld = (command: string, value: boolean, selectedMachine?: number) => send({
    command,
    value,
    ...(selectedMachine ? { machine: selectedMachine } : {}),
  });

  const releaseHeld = () => {
    ['gripper1', 'gripper2', 'gripperRotation', 'gripperGlobal'].forEach((command) => setHeld(`fault.${command}`, false));
    for (let index = 1; index <= 3; index += 1) {
      [...machineToggles, ...timeoutToggles].forEach(([command]) => setHeld(`fault.machine.${command}`, false, index));
    }
  };

  return <aside className={`side-panel fault-injection-panel ${className ?? ''}`}>
    <FaultPanelHeading eyebrow="РУЧНОЕ УПРАВЛЕНИЕ · ДИАГНОСТИКА" title="Инъекции ошибок" onClose={onClose} />
    <FaultModeBanner requested={requested} enabled={enabled} online={online} />

    <section className="fault-injection-mode">
      <h3>Режим инъекций</h3>
      <FaultToggle label="Разрешить симуляцию ошибок" checked={requested} online={online} onChange={(value) => send({ command: 'fault.enable', value })} />
    </section>

    <section>
      <h3>Оси и группа XYZ</h3>
      <div className="fault-button-grid three-columns">
        {[1, 2, 3].map((index) => <InjectionButton key={index} status={readInjectionStatus(values, `astAxisFaultStatus[${index}]`)} online={online} onClick={() => pulse(send, 'fault.axisJogConflict', index)}>Конфликт Jog {['X', 'Y', 'Z'][index - 1]}</InjectionButton>)}
      </div>
      <div className="fault-button-grid"><InjectionButton status={axisGroup} online={online} tone="danger" onClick={() => pulse(send, pulseDefinitions.axisGroup)}>Ошибка группы SM3</InjectionButton></div>
      <FaultStatusLine status={axisGroup} />
    </section>

    <section>
      <h3>Робот и ячейка</h3>
      <div className="fault-button-grid">
        <InjectionButton status={robot} online={online} onClick={() => pulse(send, pulseDefinitions.robotWrongAction)}>Недопустимое действие робота</InjectionButton>
        <InjectionButton status={cell} online={online} onClick={() => pulse(send, pulseDefinitions.cellBothGrippers)}>Ошибка согласованности захватов</InjectionButton>
      </div>
    </section>

    <section>
      <h3>Механизм захвата</h3>
      <FaultToggle label="Неисправность захвата 1" checked={readBool(values, 'xSimGripper1Fault')} allowed={gripper.allowed} online={online} onChange={(value) => setHeld('fault.gripper1', value)} />
      <FaultToggle label="Неисправность захвата 2" checked={readBool(values, 'xSimGripper2Fault')} allowed={gripper.allowed} online={online} onChange={(value) => setHeld('fault.gripper2', value)} />
      <FaultToggle label="Неисправность поворота" checked={readBool(values, 'xSimGripperRotationFault')} allowed={gripper.allowed} online={online} onChange={(value) => setHeld('fault.gripperRotation', value)} />
      <FaultToggle label="Общая неисправность захвата" checked={readBool(values, 'xSimGripperGlobalFault')} allowed={gripper.allowed} online={online} onChange={(value) => setHeld('fault.gripperGlobal', value)} />
      <FaultStatusLine status={gripper} />
    </section>

    <section>
      <h3>Проверка координат точки</h3>
      <div className="fault-button-grid two-columns">
        <InjectionButton status={point} online={online} onClick={() => pulse(send, pulseDefinitions.pointX)}>X вне границ</InjectionButton>
        <InjectionButton status={point} online={online} onClick={() => pulse(send, pulseDefinitions.pointY)}>Y вне границ</InjectionButton>
        <InjectionButton status={point} online={online} onClick={() => pulse(send, pulseDefinitions.pointZ)}>Z вне границ</InjectionButton>
        <InjectionButton status={point} online={online} onClick={() => pulse(send, pulseDefinitions.pointVelocity)}>Недопустимая скорость</InjectionButton>
      </div>
    </section>

    <section>
      <h3>Магазин</h3>
      <div className="fault-button-grid two-columns">
        <InjectionButton status={magazine} online={online} onClick={() => pulse(send, pulseDefinitions.magazineWrongOperation)}>Неверная операция</InjectionButton>
        <InjectionButton status={magazine} online={online} onClick={() => pulse(send, pulseDefinitions.magazineNoBlank)}>Нет заготовки</InjectionButton>
        <InjectionButton status={magazine} online={online} onClick={() => pulse(send, pulseDefinitions.magazineNoFreeSlot)}>Нет свободного слота</InjectionButton>
        <InjectionButton status={magazine} online={online} onClick={() => pulse(send, pulseDefinitions.magazineInvalidSlot)}>Неверный слот</InjectionButton>
        <InjectionButton status={magazine} online={online} onClick={() => pulse(send, pulseDefinitions.magazineSlotContent)}>Содержимое слота</InjectionButton>
        <InjectionButton status={magazine} online={online} onClick={() => pulse(send, pulseDefinitions.magazineGeometry)}>Геометрия магазина</InjectionButton>
      </div>
    </section>

    <section>
      <h3>Станки и TIMEOUT</h3>
      <div className="segmented three fault-machine-selector">{[1, 2, 3].map((index) => <button type="button" key={index} className={machine === index ? 'active' : ''} onClick={() => setMachine(index)}>Станок {index}</button>)}</div>
      <div className="fault-subsection-title">Источники аварий</div>
      {machineToggles.map(([command, label, path]) => <FaultToggle key={command} label={label} checked={readBool(values, `${path}[${machine}]`)} allowed={machineStatus.allowed} online={online} onChange={(value) => setHeld(`fault.machine.${command}`, value, machine)} />)}
      <div className="fault-subsection-title">Принудительные TIMEOUT</div>
      {timeoutToggles.map(([command, label, path]) => <FaultToggle key={command} label={label} checked={readBool(values, `${path}[${machine}]`)} allowed={machineStatus.allowed} online={online} onChange={(value) => setHeld(`fault.machine.${command}`, value, machine)} />)}
      <div className="fault-button-grid fault-reset-grid">
        <InjectionButton status={{ ...machineStatus, allowed: machineStatus.resetAllowed }} online={online} tone="reset" onClick={() => pulse(send, 'fault.machine.simReset', machine)}>Сброс симулятора</InjectionButton>
      </div>
      <FaultStatusLine status={machineStatus} />
    </section>

    <div className="panel-actions"><button type="button" disabled={!online} onClick={releaseHeld}><RotateCcw />Снять удерживаемые инъекции</button></div>
  </aside>;
}
