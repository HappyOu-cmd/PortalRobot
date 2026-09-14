import type { ControlCabinetStates, FrontControlCabinetState } from '../model/controlCabinets';
import { ToggleSwitch } from './ui/ControlPrimitives';

const FRONT_BUTTONS = [
  { signal: 'emergencyStopPressed', label: 'Аварийный грибок нажат', description: 'Красное мигание и утапливание грибка' },
  { signal: 'startPressed', label: 'Старт нажат', description: 'Зелёная подсветка и утапливание кнопки' },
  { signal: 'stopPressed', label: 'Стоп нажат', description: 'Красная подсветка и утапливание кнопки' },
  { signal: 'resetPressed', label: 'Сброс нажат', description: 'Жёлтая подсветка и утапливание кнопки' },
] as const;

export function ControlCabinetManualControl({ cabinets, plcDataEnabled, onFrontChange, onRearChange, onPhaseRelayFaultChange, onLowPressureChange }: {
  cabinets: ControlCabinetStates;
  plcDataEnabled: boolean;
  onFrontChange: (signal: keyof FrontControlCabinetState, pressed: boolean) => void;
  onRearChange: (pressed: boolean) => void;
  onPhaseRelayFaultChange: (active: boolean) => void;
  onLowPressureChange: (active: boolean) => void;
}) {
  return <>
    <section>
      <h3>Передний шкаф · опора 4</h3>
      {FRONT_BUTTONS.map(({ signal, label, description }) => <ToggleSwitch
        key={signal}
        label={label}
        description={description}
        checked={cabinets.front[signal]}
        disabled={plcDataEnabled}
        onChange={(pressed) => onFrontChange(signal, pressed)}
      />)}
    </section>
    <section>
      <h3>Задний шкаф · опора 4</h3>
      <ToggleSwitch
        label="Аварийный грибок нажат"
        description="Красное мигание и утапливание грибка"
        checked={cabinets.rear.emergencyStopPressed}
        disabled={plcDataEnabled}
        onChange={onRearChange}
      />
      <ToggleSwitch
        label="Авария реле контроля фаз"
        description="Красное мигание знака молнии"
        checked={cabinets.rear.phaseRelayFault ?? false}
        onChange={onPhaseRelayFaultChange}
      />
    </section>
    <section>
      <h3>Воздухоподготовка · под задним шкафом</h3>
      <ToggleSwitch
        label="Низкое давление воздуха"
        description="Красное мигание воздухоподготовки"
        checked={cabinets.airPreparation?.lowPressure ?? false}
        onChange={onLowPressureChange}
      />
    </section>
  </>;
}
