import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { PlcCommand } from '../../plc/client';
import { readBool, readInjectionStatus } from '../../model/faultSimulation';
import { FaultModeBanner, FaultPanelHeading, FaultToggle } from './FaultSimulationControls';

export function InjectionSettingsPanel({ values, online, send, onClose, className }: {
  values: Record<string, unknown>;
  online: boolean;
  send: (command: PlcCommand) => void;
  onClose: () => void;
  className?: string;
}) {
  const requested = readBool(values, 'xErrorSimulationEnable');
  const enabled = readBool(values, 'xErrorSimulationEnabled');
  const statuses = [
    ...[1, 2, 3].map((index) => readInjectionStatus(values, `astAxisFaultStatus[${index}]`)),
    readInjectionStatus(values, 'stAxisGroupFaultStatus'),
    readInjectionStatus(values, 'stRobotFaultStatus'),
    readInjectionStatus(values, 'stCellFaultStatus'),
    readInjectionStatus(values, 'stGripperFaultStatus'),
    readInjectionStatus(values, 'stPointFaultStatus'),
    readInjectionStatus(values, 'stMagazineFaultStatus'),
    ...[1, 2, 3].map((index) => readInjectionStatus(values, `astMachineFaultStatus[${index}]`)),
  ];
  const active = statuses.filter((status) => status.active).length;
  const ready = statuses.filter((status) => status.allowed).length;
  const rejected = statuses.reduce((total, status) => total + status.rejectSequence, 0);

  return <aside className={`side-panel injection-settings-panel ${className ?? ''}`}>
    <FaultPanelHeading eyebrow="НАСТРОЙКИ · ДИАГНОСТИЧЕСКИЙ РЕЖИМ" title="Настройки инъекции" onClose={onClose} />
    <FaultModeBanner requested={requested} enabled={enabled} online={online} />
    <section>
      <h3>Разрешение инъекций</h3>
      <FaultToggle
        label="Разрешить симуляцию ошибок"
        detail="Удерживаемый бит GVL_HMI.xErrorSimulationEnable"
        checked={requested}
        online={online}
        onChange={(value) => send({ command: 'fault.enable', value })}
      />
      <p className="panel-note">Фактическое состояние отображается только после подтверждения `xErrorSimulationEnabled` со стороны PLC.</p>
    </section>
    <section>
      <h3>Состояние драйверов</h3>
      <div className="fault-summary-grid">
        <div><span>Готовы</span><b>{ready} / {statuses.length}</b></div>
        <div><span>Активны</span><b>{active}</b></div>
        <div><span>Отклонено</span><b>{rejected}</b></div>
      </div>
    </section>
    <section className="fault-safety-note">
      <ShieldCheck />
      <div><h3>Проверка остаётся в PLC</h3><p>Интерфейс только приглушает недоступные команды по `xAllowed`. Окончательное разрешение и регистрация отклонения выполняются функциональным блоком.</p></div>
    </section>
    <section className="fault-warning-note">
      <AlertTriangle />
      <p>Используйте режим только при наладке и проверке обработки аварий. После теста снимите удерживаемые неисправности и выполните требуемый сброс.</p>
    </section>
  </aside>;
}
