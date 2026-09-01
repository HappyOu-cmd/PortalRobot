import { RotateCcw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlcCommand } from '../../plc/client';
import {
  DEFAULT_SIMULATION_SETTINGS,
  readSimulationSettings,
  type SimulationSettings,
} from '../../model/faultSimulation';
import { FaultPanelHeading, SimulationTimeField } from './FaultSimulationControls';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function SimulationSettingsPanel({ values, online, send, onClose, className }: {
  values: Record<string, unknown>;
  online: boolean;
  send: (command: PlcCommand) => void;
  onClose: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<SimulationSettings>(() => readSimulationSettings(values));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(readSimulationSettings(values));
  }, [dirty, values]);

  const change = (edit: (current: SimulationSettings) => SimulationSettings) => {
    setDraft((current) => edit(current));
    setDirty(true);
  };
  const changeCycle = (index: number, value: number) => change((current) => {
    const machineCycle = [...current.machineCycle] as SimulationSettings['machineCycle'];
    machineCycle[index] = value;
    return { ...current, machineCycle };
  });
  const changeValue = (key: Exclude<keyof SimulationSettings, 'machineCycle'>, value: number) => change((current) => ({ ...current, [key]: value }));
  const valid = Object.values(draft).flat().every((value) => Number.isFinite(value) && value > 0);

  const apply = () => {
    if (!online || !valid) return;
    draft.machineCycle.forEach((value, index) => send({ command: 'machine.cycleTime', machine: index + 1, value: clamp(value, 1, 86400) }));
    send({ command: 'simulation.machineDoorOpen', value: clamp(draft.machineDoorOpen, 0.05, 120) });
    send({ command: 'simulation.machineDoorClose', value: clamp(draft.machineDoorClose, 0.05, 120) });
    send({ command: 'simulation.machineChuckOpen', value: clamp(draft.machineChuckOpen, 0.05, 120) });
    send({ command: 'simulation.machineChuckClose', value: clamp(draft.machineChuckClose, 0.05, 120) });
    send({ command: 'simulation.gripper1Open', value: clamp(draft.gripper1Open, 0.05, 120) });
    send({ command: 'simulation.gripper1Close', value: clamp(draft.gripper1Close, 0.05, 120) });
    send({ command: 'simulation.gripper2Open', value: clamp(draft.gripper2Open, 0.05, 120) });
    send({ command: 'simulation.gripper2Close', value: clamp(draft.gripper2Close, 0.05, 120) });
    send({ command: 'simulation.gripperChange', value: clamp(draft.gripperChange, 0.05, 120) });
    setDirty(false);
  };

  return <aside className={`side-panel simulation-settings-panel ${className ?? ''}`}>
    <FaultPanelHeading eyebrow="НАСТРОЙКИ · ВИРТУАЛЬНОЕ ОБОРУДОВАНИЕ" title="Настройки симуляции" onClose={onClose} />
    <section>
      <h3>Время обработки</h3>
      <div className="simulation-fields-grid">
        {draft.machineCycle.map((value, index) => <SimulationTimeField key={index} label={`Станок ${index + 1}`} value={value} min={1} max={86400} step={1} onChange={(next) => changeCycle(index, next)} />)}
      </div>
    </section>
    <section>
      <h3>Роботный люк станка</h3>
      <div className="simulation-fields-grid two-columns">
        <SimulationTimeField label="Открытие" value={draft.machineDoorOpen} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('machineDoorOpen', value)} />
        <SimulationTimeField label="Закрытие" value={draft.machineDoorClose} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('machineDoorClose', value)} />
      </div>
    </section>
    <section>
      <h3>Патрон станка</h3>
      <div className="simulation-fields-grid two-columns">
        <SimulationTimeField label="Открытие" value={draft.machineChuckOpen} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('machineChuckOpen', value)} />
        <SimulationTimeField label="Закрытие" value={draft.machineChuckClose} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('machineChuckClose', value)} />
      </div>
    </section>
    <section>
      <h3>Двойной захват</h3>
      <div className="simulation-fields-grid two-columns">
        <SimulationTimeField label="Захват 1 · открытие" value={draft.gripper1Open} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('gripper1Open', value)} />
        <SimulationTimeField label="Захват 1 · закрытие" value={draft.gripper1Close} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('gripper1Close', value)} />
        <SimulationTimeField label="Захват 2 · открытие" value={draft.gripper2Open} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('gripper2Open', value)} />
        <SimulationTimeField label="Захват 2 · закрытие" value={draft.gripper2Close} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('gripper2Close', value)} />
        <SimulationTimeField label="Смена рабочего захвата" value={draft.gripperChange} min={0.05} max={120} step={0.05} onChange={(value) => changeValue('gripperChange', value)} />
      </div>
    </section>
    {!valid && <p className="simulation-validation">Все значения должны быть больше нуля.</p>}
    <div className="simulation-panel-actions">
      <button type="button" onClick={() => { setDraft(structuredClone(DEFAULT_SIMULATION_SETTINGS)); setDirty(true); }}><RotateCcw />По умолчанию</button>
      <button className="primary" type="button" disabled={!online || !dirty || !valid} onClick={apply}><Save />Применить</button>
    </div>
  </aside>;
}
