import type { MagazineCalibrationMethod, MagazineCalibrationStatus } from '../../points/magazineCalibration';
import { SegmentedControl } from '../ui/ControlPrimitives';
import './magazine-calibration.css';

export function MagazineCalibrationSettings({ calibration, online, onChange }: {
  calibration: readonly MagazineCalibrationStatus[];
  online: boolean;
  onChange: (magazine: 1 | 2, method: MagazineCalibrationMethod) => void;
}) {
  return <div className="magazine-calibration-settings">
    <h3>Калибровка магазинов</h3>
    {calibration.map((item, offset) => <div className="magazine-calibration-setting" key={offset}>
      <div><strong>Магазин {offset + 1}</strong><span className={item.ready ? 'configured' : 'unconfigured'}>{item.ready ? 'Настроен' : item.reason === 4 ? 'Плоскость не определена' : 'Не настроен'}</span></div>
      <SegmentedControl value={String(item.method)} disabled={!online}
        className={`cell-settings-mode-switch two ${item.changeAllowed ? '' : 'command-unavailable'}`}
        ariaLabel={`Способ калибровки магазина ${offset + 1}`}
        options={[{ value: '1', label: '1 точка', ariaDisabled: !item.changeAllowed },
          { value: '3', label: '3 точки', ariaDisabled: !item.changeAllowed }]}
        onChange={value => onChange((offset + 1) as 1 | 2, Number(value) as MagazineCalibrationMethod)} />
    </div>)}
  </div>;
}
