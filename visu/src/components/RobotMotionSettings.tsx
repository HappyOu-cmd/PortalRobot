import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CircleHelp, X } from 'lucide-react';
import type { PlcCellSettings, PlcCommand } from '../plc/client';

type MotionSettings = PlcCellSettings['robotMotion'];
type MotionSettingKey = keyof MotionSettings;

type MotionField = {
  key: MotionSettingKey;
  command: string;
  label: string;
  shortLabel: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  description: string;
  details: string[];
};

const MOTION_FIELDS: MotionField[] = [
  {
    key: 'accelerationPercent', command: 'cell.settings.robotAccelerationPercent',
    label: 'Глобальный разгон', shortLabel: 'Разгон', unit: '%', min: 1, max: 100, step: 1,
    description: 'Ограничивает ускорение относительно максимума, заданного для каждой оси.',
    details: [
      'Для JOG и одиночных MoveAbsolute/MoveRelative масштабирует вход Acceleration.',
      'Для движения группы SoftMotion используется единый AccFactor. PLC берёт меньшее значение из процентов разгона и торможения.',
      '100% означает полный инженерный предел оси; значение не увеличивает физический максимум.',
    ],
  },
  {
    key: 'decelerationPercent', command: 'cell.settings.robotDecelerationPercent',
    label: 'Глобальное торможение', shortLabel: 'Тормож', unit: '%', min: 1, max: 100, step: 1,
    description: 'Ограничивает штатное замедление движения относительно максимума каждой оси.',
    details: [
      'Для JOG и одиночных перемещений масштабирует отдельный вход Deceleration.',
      'У групповой траектории отдельного DecFactor нет, поэтому PLC применяет более строгий из процентов разгона и торможения как общий AccFactor.',
      'Не управляет аварийной или штатной групповой остановкой: для неё ниже есть отдельный Halt Deceleration.',
    ],
  },
  {
    key: 'jerkPercent', command: 'cell.settings.robotJerkPercent',
    label: 'Глобальный рывок', shortLabel: 'Рывок', unit: '%', min: 1, max: 100, step: 1,
    description: 'Ограничивает скорость изменения ускорения и делает начало и конец движения мягче.',
    details: [
      'Масштабирует рывок для JOG, одиночных и групповых перемещений.',
      'Меньшее значение даёт более мягкий профиль, но увеличивает время разгона и торможения.',
      'Этот процент не изменяет рывок контролируемой остановки группы.',
    ],
  },
  {
    key: 'haltDeceleration', command: 'cell.settings.robotHaltDeceleration',
    label: 'Замедление останова', shortLabel: 'Замедление останова', unit: 'мм/с²', min: 1, max: 100000, step: 10,
    description: 'Абсолютное замедление контролируемой остановки координатной группы XYZ.',
    details: [
      'MC_GroupHalt использует указанное значение напрямую.',
      'MC_GroupStop в текущей логике использует удвоенное значение для более быстрого останова.',
      'Параметр не меняет обычное торможение JOG и траекторий к точкам.',
    ],
  },
  {
    key: 'haltJerk', command: 'cell.settings.robotHaltJerk',
    label: 'Рывок останова', shortLabel: 'Рывок останова', unit: 'мм/с³', min: 1, max: 1000000, step: 100,
    description: 'Абсолютный рывок контролируемой остановки координатной группы XYZ.',
    details: [
      'MC_GroupHalt использует указанное значение напрямую.',
      'MC_GroupStop в текущей логике использует удвоенное значение.',
      'Чем меньше значение, тем мягче нарастает торможение и тем длиннее может быть остановочный путь.',
    ],
  },
];

function clamp(value: number, field: MotionField) {
  return Math.max(field.min, Math.min(field.max, value));
}

function displayValue(value: number, step: number) {
  return step < 1 ? value.toFixed(1) : Math.round(value).toString();
}

function MotionHelp() {
  return <Dialog.Root>
    <Dialog.Trigger asChild>
      <button type="button" className="rj-motion-help-trigger" aria-label="Что настраивают параметры динамики">
        <CircleHelp aria-hidden="true" />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="rj-motion-help-overlay" />
      <Dialog.Content className="rj-motion-help-card">
        <div className="rj-motion-help-heading">
          <div><span>ПРОФИЛЬ SOFTMOTION</span><Dialog.Title>Параметры динамики</Dialog.Title></div>
          <Dialog.Close asChild><button type="button" aria-label="Закрыть описание"><X /></button></Dialog.Close>
        </div>
        <Dialog.Description>Здесь настраивается характер обычного движения и контролируемой остановки робота.</Dialog.Description>
        <div className="rj-motion-help-list">{MOTION_FIELDS.map((field) => <section key={field.key}>
          <h3>{field.label}</h3><p>{field.description}</p>
          <small>{field.min}–{field.max.toLocaleString('ru-RU')} {field.unit}</small>
        </section>)}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function MotionSettingRow({ field, value, disabled, onCommit }: {
  field: MotionField;
  value: number;
  disabled: boolean;
  onCommit: (command: string, value: number) => void;
}) {
  const [draft, setDraft] = useState(() => displayValue(value, field.step));
  const editingRef = useRef(false);
  useEffect(() => {
    if (!editingRef.current) setDraft(displayValue(value, field.step));
  }, [field.step, value]);

  const commitValue = (raw: string | number) => {
    editingRef.current = false;
    const parsed = Number(String(raw).replace(',', '.'));
    const next = clamp(Number.isFinite(parsed) ? parsed : value, field);
    setDraft(displayValue(next, field.step));
    if (Math.abs(next - value) > 0.0001) onCommit(field.command, next);
  };
  const commit = () => commitValue(draft);
  const numericDraft = Number(draft.replace(',', '.'));
  const rangeValue = clamp(Number.isFinite(numericDraft) ? numericDraft : value, field);

  return <div className="rj-motion-setting" data-kind={field.key.startsWith('halt') ? 'halt' : 'factor'}>
    <div className="rj-motion-setting-head">
      <span>{field.shortLabel}</span>
      <label><input
        type="number" inputMode="decimal" value={draft} min={field.min} max={field.max} step={field.step}
        disabled={disabled} aria-label={field.label}
        onFocus={() => { editingRef.current = true; }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      /><small>{field.unit}</small></label>
    </div>
    {!field.key.startsWith('halt') ? <input
      type="range" value={rangeValue} min={field.min} max={field.max} step={field.step}
      disabled={disabled} aria-label={`${field.label}, ползунок`}
      onPointerDown={() => { editingRef.current = true; }}
      onChange={(event) => setDraft(displayValue(Number(event.target.value), field.step))}
      onPointerUp={(event) => commitValue(event.currentTarget.value)}
      onKeyUp={(event) => { if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') commitValue(event.currentTarget.value); }}
    /> : <p>{field.description}</p>}
  </div>;
}

export function RobotMotionSettings({ settings, online, changeAllowed, onSend }: {
  settings: MotionSettings;
  online: boolean;
  changeAllowed: boolean;
  onSend: (command: PlcCommand) => void;
}) {
  const disabled = !online || !changeAllowed;
  return <section className="rj-surface rj-motion-settings" aria-label="Настройки динамики робота">
    <div className="rj-motion-settings-title">
      <div><span>ПРОФИЛЬ SOFTMOTION</span><h3>Динамика движения</h3></div>
      <MotionHelp />
    </div>
    <div className="rj-motion-factor-grid">
      {MOTION_FIELDS.slice(0, 3).map((field) => <MotionSettingRow key={field.key} field={field} value={settings[field.key]} disabled={disabled} onCommit={(command, value) => onSend({ command, value })} />)}
    </div>
    <div className="rj-motion-halt-grid">
      {MOTION_FIELDS.slice(3).map((field) => <MotionSettingRow key={field.key} field={field} value={settings[field.key]} disabled={disabled} onCommit={(command, value) => onSend({ command, value })} />)}
    </div>
    <p className="rj-motion-settings-note" data-disabled={disabled}>
      {!online ? 'Нет связи с PLC.' : changeAllowed ? 'Новое значение применяется к следующему движению.' : 'Настройка доступна после полной остановки робота и ячейки.'}
    </p>
  </section>;
}
