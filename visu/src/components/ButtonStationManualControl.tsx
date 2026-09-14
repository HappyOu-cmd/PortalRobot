import { BUTTON_STATIONS } from '../model/buttonStations';
import type { ButtonStationState, ButtonStationStates } from '../model/buttonStations';
import type { EnclosureDoorId } from '../model/types';
import { ToggleSwitch } from './ui/ControlPrimitives';

const STATION_LABELS: Record<EnclosureDoorId, string> = {
  'magazine-1-front': 'Магазин 1 · передний пост',
  'magazine-1-rear': 'Магазин 1 · задний пост',
  'magazine-2-front': 'Магазин 2 · передний пост',
  'magazine-2-rear': 'Магазин 2 · задний пост',
};

export function ButtonStationManualControl({
  stations,
  disabled = false,
  onChange,
}: {
  stations: ButtonStationStates;
  disabled?: boolean;
  onChange: (id: EnclosureDoorId, patch: Partial<ButtonStationState>) => void;
}) {
  return <section className="button-station-manual-control">
    <h3>Проверка кнопочных постов</h3>
    <p className="panel-note">Локальные сигналы для проверки 3D-анимации. Они не отправляются в PLC.</p>
    {BUTTON_STATIONS.map(({ id }) => {
      const station = stations[id];
      return <div className="button-station-manual-control__item" key={id}>
        <strong>{STATION_LABELS[id]}</strong>
        <ToggleSwitch
          label="Вход: грибок нажат"
          checked={station.emergencyStopPressed}
          disabled={disabled}
          onChange={(value) => onChange(id, { emergencyStopPressed: value })}
        />
        <ToggleSwitch
          label="Выход: подсветка кнопки"
          checked={station.buttonLightOn}
          disabled={disabled}
          onChange={(value) => onChange(id, { buttonLightOn: value })}
        />
      </div>;
    })}
    {disabled && <p className="panel-note warning" role="status">Отключи источник OPC UA, чтобы подать локальный тестовый сигнал.</p>}
  </section>;
}
