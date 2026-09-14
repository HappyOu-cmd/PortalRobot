import type { MpgPendantState } from '../model/mpgPendant';
import { ToggleSwitch } from './ui/ControlPrimitives';

const AXES = [
  { signal: 'axisX', label: 'Ось X' },
  { signal: 'axisY', label: 'Ось Y' },
  { signal: 'axisZ', label: 'Ось Z' },
] as const;
const MULTIPLIERS = [
  { signal: 'multiplier1', label: 'Множитель ×1' },
  { signal: 'multiplier10', label: 'Множитель ×10' },
  { signal: 'multiplier100', label: 'Множитель ×100' },
] as const;

export function MpgManualControl({ state, disabled, onChange }: {
  state: MpgPendantState;
  disabled: boolean;
  onChange: (patch: Partial<MpgPendantState>) => void;
}) {
  return <section>
    <h3>MPG-пульт · опора 2</h3>
    <ToggleSwitch
      label="Аварийный грибок нажат"
      description="Красное мигание и утапливание грибка"
      checked={state.emergencyStopPressed}
      disabled={disabled}
      onChange={(emergencyStopPressed) => onChange({ emergencyStopPressed })}
    />
    {AXES.map(({ signal, label }) => <ToggleSwitch
      key={signal}
      label={label}
      checked={state[signal]}
      disabled={disabled}
      onChange={(enabled) => onChange(enabled
        ? { axisX: false, axisY: false, axisZ: false, [signal]: true }
        : { [signal]: false })}
    />)}
    <p className="panel-note">Все сигналы осей выключены — переключатель в положении OFF.</p>
    {MULTIPLIERS.map(({ signal, label }) => <ToggleSwitch
      key={signal}
      label={label}
      checked={state[signal]}
      disabled={disabled}
      onChange={(enabled) => onChange(enabled
        ? { multiplier1: false, multiplier10: false, multiplier100: false, [signal]: true }
        : { [signal]: false })}
    />)}
    <p className="panel-note">Без сигнала множителя ручка сохраняет последнее положение; начальное — ×1.</p>
  </section>;
}
