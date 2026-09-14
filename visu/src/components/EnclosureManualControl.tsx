import { ENCLOSURE_DOORS, isEnclosureDoorUnsecured } from '../model/enclosure';
import type { ButtonStationState, ButtonStationStates } from '../model/buttonStations';
import type { EnclosureDoorId, EnclosureDoorState, EnclosureDoorStates } from '../model/types';
import { ToggleSwitch } from './ui/ControlPrimitives';
import { ButtonStationManualControl } from './ButtonStationManualControl';

export function EnclosureManualControl({ doors, buttonStations, plcDataEnabled = false, onChange, onButtonStationChange }: {
  doors: EnclosureDoorStates;
  buttonStations: ButtonStationStates;
  plcDataEnabled?: boolean;
  onChange: (id: EnclosureDoorId, patch: Partial<EnclosureDoorState>) => void;
  onButtonStationChange: (id: EnclosureDoorId, patch: Partial<ButtonStationState>) => void;
}) {
  return <>
    <p className="panel-note">Локальное управление 3D-моделью. Концевик двери и магнит переключаются независимо.</p>
    {ENCLOSURE_DOORS.map(({ id, label }) => {
      const door = doors[id];
      return <section key={id}>
        <h3>{label}</h3>
        <ToggleSwitch
          label="Дверь закрыта"
          description="Концевик двери"
          checked={door.closed}
          onChange={(closed) => onChange(id, { closed })}
        />
        <ToggleSwitch
          label="Электромагнитный замок замкнут"
          description="Состояние магнитного замка"
          checked={door.locked}
          onChange={(locked) => onChange(id, { locked })}
        />
        {isEnclosureDoorUnsecured(door, true) && <p className="panel-note warning" role="status">При включённом магазине открытый замок даёт красную пульсацию.</p>}
      </section>;
    })}
    <ButtonStationManualControl stations={buttonStations} disabled={plcDataEnabled} onChange={onButtonStationChange} />
  </>;
}
