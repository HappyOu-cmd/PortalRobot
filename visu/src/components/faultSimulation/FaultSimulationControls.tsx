import { CheckCircle2, ChevronRight, Clock3 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FaultInjectionStatus } from '../../model/faultSimulation';

export function FaultPanelHeading({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return <div className="panel-heading"><div><span>{eyebrow}</span><h2>{title}</h2></div><button type="button" onClick={onClose} title="Закрыть"><ChevronRight /></button></div>;
}

export function FaultModeBanner({ requested, enabled, online }: { requested: boolean; enabled: boolean; online: boolean }) {
  const tone = !online ? 'offline' : enabled ? 'enabled' : requested ? 'pending' : 'disabled';
  const text = !online ? 'Нет связи с PLC' : enabled ? 'Инъекция разрешена PLC' : requested ? 'Ожидается подтверждение PLC' : 'Режим инъекции выключен';
  return <div className={`fault-mode-banner ${tone}`}><span className="fault-mode-dot" /><div><b>{text}</b><small>{enabled ? 'Тестовые команды доступны в пределах условий функциональных блоков.' : 'Включите режим в разделе «Настройки инъекции».'}</small></div></div>;
}

export function FaultToggle({ label, checked, allowed = true, online, onChange, detail }: {
  label: string;
  checked: boolean;
  allowed?: boolean;
  online: boolean;
  onChange: (value: boolean) => void;
  detail?: string;
}) {
  return <label className={`fault-toggle ${!allowed ? 'command-unavailable' : ''} ${!online ? 'disabled' : ''}`}>
    <span>{label}{detail && <small>{detail}</small>}</span>
    <input type="checkbox" checked={checked} disabled={!online} aria-disabled={!allowed || !online} onChange={(event) => onChange(event.target.checked)} />
    <i />
  </label>;
}

export function InjectionButton({ children, status, online, onClick, tone = 'default' }: {
  children: ReactNode;
  status: FaultInjectionStatus;
  online: boolean;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'reset';
}) {
  return <button
    className={`fault-injection-button ${tone} ${status.active ? 'active' : ''} ${!status.allowed ? 'command-unavailable' : ''}`}
    type="button"
    disabled={!online}
    aria-disabled={!online || !status.allowed}
    onClick={onClick}
  >
    <span>{children}</span>
    <small>{status.busy ? 'Выполняется' : status.active ? 'Активна' : status.allowed ? 'Готово' : 'Недоступно'}</small>
  </button>;
}

export function FaultStatusLine({ status }: { status: FaultInjectionStatus }) {
  return <div className="fault-status-line">
    <span><CheckCircle2 />{status.active ? 'Источник активен' : status.allowed ? 'Готов к инъекции' : 'Ожидание допустимого состояния'}</span>
    {status.rejectSequence > 0 && <b>Отклонений: {status.rejectSequence}</b>}
  </div>;
}

export function SimulationTimeField({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return <label className="simulation-time-field"><span>{label}</span><div><Clock3 /><input type="number" value={value} min={min} max={max} step={step} inputMode="decimal" onChange={(event) => onChange(Number(event.target.value))} /><em>с</em></div></label>;
}
