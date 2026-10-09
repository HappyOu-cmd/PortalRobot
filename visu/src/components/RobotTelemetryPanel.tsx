import { cn } from '../lib/utils';
import type { Vec3Mm } from '../model/types';
import { RobotSpeedEditor } from './RobotSpeedEditor';
import './robot-extended-panel.css';
import './robot-telemetry-panel.css';

type RobotTelemetryPanelProps = {
  coordinates: Vec3Mm;
  speedOverridePercent: number;
  online: boolean;
  editable: boolean;
  modbusMode: boolean;
  onSpeedChange: (value: number) => void;
  className?: string;
};

export function RobotTelemetryPanel({ coordinates, speedOverridePercent, online, editable, modbusMode, onSpeedChange, className }: RobotTelemetryPanelProps) {
  return <aside className={cn('robot-telemetry-panel robot-redesign', className)} aria-label="Координаты и скорость робота">
    <section className="rj-surface">
      <div className="rj-section-head">
        <div><span className="rj-eyebrow">ПОЛОЖЕНИЕ РОБОТА</span><h3>Текущие координаты</h3></div>
        <span className="rj-status" data-online={online}><i />{online ? 'Онлайн' : 'Нет связи'}</span>
      </div>
      <dl className="robot-telemetry-coordinates">
        {(['x', 'y', 'z'] as const).map((axis) => <div className="rj-axis-option" key={axis}>
          <dt><b>{axis.toUpperCase()}</b></dt>
          <dd><strong>{Number.isFinite(coordinates[axis]) ? coordinates[axis].toFixed(1) : '—'}<small>мм</small></strong></dd>
        </div>)}
      </dl>
    </section>
    <section className="rj-surface rj-speed">
      {modbusMode ? <div className="robot-telemetry-speed-note"><span>Общая скорость робота</span><small>Настраивается на контроллере робота</small></div> : <RobotSpeedEditor
        value={speedOverridePercent}
        online={online && editable}
        onChange={onSpeedChange}
      />}
    </section>
  </aside>;
}
